import {config as dotenvConfig} from 'dotenv';
import '@nomiclabs/hardhat-etherscan'
import 'dotenv/config';
import 'hardhat-deploy';
import 'hardhat-deploy-ethers';
import 'hardhat-gas-reporter';
import {HardhatUserConfig} from 'hardhat/types';
import {accounts} from './utils/networks';
dotenvConfig();

const envAccounts = [
  process.env.PRIVATE_KEY_1 || '',
];

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: '0.8.4',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      forking: {
        url: 'https://polygon-rpc.com',
      },
    },
    localhost: {
      url: 'http://localhost:8545',
      accounts: accounts('localhost'),
    },
    mumbai: {
      url: 'https://rpc-mumbai.maticvigil.com',
      accounts: accounts('mumbai'),
      live: true,
    },
    matic: {
      url: 'https://rpc-mainnet.maticvigil.com',
      accounts: accounts('matic'),
      live: true,
    },
    polygon: {
      url: 'https://polygon-rpc.com',
      accounts: envAccounts,
    },
    avalanche: {
      url: 'https://api.avax.network/ext/bc/C/rpc',
      accounts: envAccounts,
    },
  },
  gasReporter: {
    currency: 'USD',
    gasPrice: 5,
    enabled: !!process.env.REPORT_GAS,
  },
  namedAccounts: {
    creator: 1,
  },
  paths: {
    sources: './contracts',
    artifacts: './artifacts',
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

export default config;
