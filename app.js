const abiDecoder = require("abi-decoder");
const { ethers } = require("ethers");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
require("dotenv").config();

const abi = [
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "uint256",
        name: "tokenId",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "addIn",
        type: "string",
      },
      {
        indexed: false,
        internalType: "string",
        name: "dropOut",
        type: "string",
      },
    ],
    name: "UsernameSet",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "address",
        name: "sender",
        type: "address",
      },
      {
        indexed: true,
        internalType: "uint256",
        name: "amount",
        type: "uint256",
      },
      {
        indexed: false,
        internalType: "string",
        name: "username",
        type: "string",
      },
    ],
    name: "TopUp",
    type: "event",
  },
];

abiDecoder.addABI(abi);

const sleep = (t) => new Promise((s) => setTimeout(s, t));

async function nameSetHandler(logs) {
  const addToWhitelist = logs.map((log) => log.events[1].value);
  const dropFromWhitelist = logs.map((log) => log.events[2].value);

  addToWhitelist.map((name) => {
    addWhitelist(name);
  });

  dropFromWhitelist.map((name) => {
    removeWhitelist(name);
  });
}

async function topUpHandler(logs) {
  for (const log of logs) {
    const amount = ethers.utils.formatEther(
      ethers.BigNumber.from(log.events[1].value)
    );
    topup(log.events[2].value, amount);
  }
}

async function topup(username, amount) {
  try {
    const response = await fetch(`${process.env.HOST}/v1/server/exec`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        key: process.env.SERVER_KEY,
      },
      body: new URLSearchParams({
        command: `eco give ${username} ${amount}`,
        time: 3,
      }),
    });
    console.log(await response.text());
    return response;
  } catch (e) {
    console.error(e);
  }
}

async function addWhitelist(username) {
  try {
    const mc_uuid_response = await fetch(
      `https://playerdb.co/api/player/minecraft/${username}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const mc_uuid = (await mc_uuid_response.json()).data.player.id;

    const response = await fetch(`${process.env.HOST}/v1/server/whitelist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        key: process.env.SERVER_KEY,
      },
      body: new URLSearchParams({
        name: username,
        uuid: mc_uuid,
      }),
    });
    console.log(response);
    return response;
  } catch (e) {
    console.error(e);
  }
}

async function removeWhitelist(username) {
  try {
    const response = await fetch(`${process.env.HOST}/v1/server/exec`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        key: process.env.SERVER_KEY,
      },
      body: new URLSearchParams({
        command: `whitelist remove ${username}`,
        time: 3,
      }),
    });
    console.log(response);
    return response;
  } catch (e) {
    console.error(e);
  }
}

async function main() {
  let provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);

  let lastProcessedBlock = (await provider.getBlockNumber()) - 10;

  while (true) {
    try {
      let currentBlock = await provider.getBlockNumber();
      console.log(currentBlock);
      if (lastProcessedBlock == currentBlock) {
        console.log("no new block");
        continue;
      }

      const nftlogs = provider.getLogs({
        address: process.env.NFT,
        fromBlock: lastProcessedBlock + 1,
        toBlock: currentBlock,
      });

      const coinLogs = provider.getLogs({
        address: process.env.Coin,
        fromBlock: lastProcessedBlock + 1,
        toBlock: currentBlock,
      });

      const logs = await Promise.all([nftlogs, coinLogs]);

      const decodedLogs = abiDecoder.decodeLogs([...logs[0], ...logs[1]]);
      const nameSetLogs = decodedLogs.filter(
        (log) => log.name === "UsernameSet"
      );
      const topUpLogs = decodedLogs.filter((log) => log.name === "TopUp");

      console.log(topUpLogs[0]);
      nameSetHandler(nameSetLogs);
      topUpHandler(topUpLogs);

      console.log(
        "set name log:",
        nameSetLogs.map((l) => l.address)
      );
      console.log(
        "top up log:",
        topUpLogs.map((l) => l.address)
      );

      lastProcessedBlock = currentBlock;
      await sleep(100);
    } catch (e) {
      console.log(e);
      provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    }
  }
}

main();
