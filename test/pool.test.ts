import {BigNumber} from '@ethersproject/bignumber';
import {Contract} from '@ethersproject/contracts';
import {expect} from 'chai';
import {deployments, ethers} from 'hardhat';
import {SignerWithAddress} from 'hardhat-deploy-ethers/signers';

type PoolInfo = {
  sharePrice: BigNumber;
  dollarPrice: BigNumber;
  dollarTotalSupply: BigNumber;
  tcr: BigNumber;
  ecr: BigNumber;
  globalCollateralValue: BigNumber;
  mintingFee: BigNumber;
  redemptionFee: BigNumber;
};

const PRICE_PRECISION = 10 ** 6;
const MISSING_DECIMALS = 12;
const COLLATERAL_RATIO_PRECISION = 10 ** 6;
const COLLATERAL_RATIO_MAX = 10 ** 6;
const SLIPPAGE = 1000;

const {execute} = deployments;
describe('pool', () => {
  let poolContract: Contract;
  let usdcContract: Contract;
  let dollarContract: Contract;
  let creator: SignerWithAddress;
  let treasuryContract: Contract;
  const collateralPrice = 1000000;
  let poolInfo: PoolInfo;

  const calculateMintMinOutputs = (
    collateralAmount: BigNumber
  ): {
    minDollarOutputAmount: BigNumber;
    minShareOutputAmount: BigNumber;
  } => {
    const {tcr, sharePrice, dollarPrice, mintingFee} = poolInfo;
    const collateralValue = collateralAmount
      .mul(10 ** MISSING_DECIMALS)
      .mul(collateralPrice)
      .div(PRICE_PRECISION);
    const totalDollarValue = collateralValue.mul(COLLATERAL_RATIO_PRECISION).div(tcr);
    const minShareOutputAmount = tcr.lt(COLLATERAL_RATIO_MAX)
      ? totalDollarValue.sub(collateralValue).mul(PRICE_PRECISION).div(sharePrice)
      : BigNumber.from(0);

    const minDollarOutputAmount = totalDollarValue
      .sub(totalDollarValue.mul(SLIPPAGE).div(COLLATERAL_RATIO_PRECISION))
      .mul(PRICE_PRECISION)
      .div(dollarPrice);
    return {
      minDollarOutputAmount,
      minShareOutputAmount,
    };
  };

  const calculateRedeemMinOutputs = (dollarAmount: BigNumber) => {
    const {sharePrice, ecr, redemptionFee} = poolInfo;
    const slippageAndFee = redemptionFee.add(SLIPPAGE);
    const dollarAmountPostFee = dollarAmount.sub(
      dollarAmount.mul(slippageAndFee).div(PRICE_PRECISION)
    );
    console.log(`ecr: ${ecr}`);
    console.log(`dollarAmountPostFee: ${dollarAmountPostFee}`);
    const minShareOutput = dollarAmountPostFee
      .sub(dollarAmountPostFee.mul(ecr).div(COLLATERAL_RATIO_MAX))
      .mul(PRICE_PRECISION)
      .div(sharePrice);
    const minCollateralOutput = dollarAmountPostFee
      .mul(ecr)
      .div(COLLATERAL_RATIO_MAX)
      .mul(PRICE_PRECISION)
      .div(collateralPrice);
    return {
      minShareOutput,
      minCollateralOutput,
    };
  };

  beforeEach(async () => {
    await deployments.fixture(['mock']);
    const accounts = await ethers.getSigners();
    creator = accounts[0];
    const dollar = await deployments.get('Dollar');
    dollarContract = new Contract(dollar.address, dollar.abi, creator);
    const usdc = await deployments.get('MockCollateral');
    usdcContract = new Contract(usdc.address, usdc.abi, creator);
    const pool = await deployments.get('PoolUSDC');
    poolContract = new Contract(pool.address, pool.abi, creator);
    const treasury = await deployments.get('Treasury');
    treasuryContract = new Contract(treasury.address, treasury.abi, creator);

    await execute(
      'MockCollateral',
      {from: creator.address, log: true},
      'mint',
      creator.address,
      ethers.utils.parseEther('100')
    );

    const info = await treasuryContract.info();
    poolInfo = {
      dollarPrice: info[0],
      sharePrice: info[1],
      dollarTotalSupply: info[2],
      tcr: info[3],
      ecr: info[4],
      globalCollateralValue: info[5],
      mintingFee: info[6],
      redemptionFee: info[7],
    };
  });

  describe('mint & redeem', () => {
    it('should mint & redeem', async () => {
      const balance = await usdcContract.balanceOf(creator.address);
      expect(balance.toString()).to.equal(ethers.utils.parseEther('100').toString());

      const dollarBalance = await dollarContract.balanceOf(creator.address);
      expect(dollarBalance.eq(0)).to.be.true;

      // expect(poolInfo.dollarPrice.toString()).to.equal('1007999955000000000');
      expect(poolInfo.mintingFee.toString()).to.equal('3000');
      expect(poolInfo.tcr.toString()).to.equal('1000000');

      const collateralAmount = ethers.utils.parseEther('1');
      const {minDollarOutputAmount, minShareOutputAmount} =
        calculateMintMinOutputs(collateralAmount);

      console.log(
        `minting ${collateralAmount.toString()}, minDollarOutputAmount: ${minDollarOutputAmount.toString()}, minShareOutputAmount: ${minShareOutputAmount.toString()}`
      );

      // 1. Approve the pool to spend creator's USDC
      await execute(
        'MockCollateral',
        {from: creator.address, log: true},
        'approve',
        poolContract.address,
        collateralAmount
      );
      // 2. Mint
      await execute(
        'PoolUSDC',
        {from: creator.address, log: true},
        'mint',
        collateralAmount,
        minShareOutputAmount,
        minDollarOutputAmount
      );

      // 3. Check that USDC was burned
      const usdcBalanceAfter = await usdcContract.balanceOf(creator.address);
      expect(usdcBalanceAfter.toString()).to.equal(ethers.utils.parseEther('99').toString());

      // 4. Check that Dollar was minted to the creator
      const dollarBalanceAfter = await dollarContract.balanceOf(creator.address);
      console.log(dollarBalanceAfter.toString());
      const amountToRedeem = ethers.utils.parseEther('0.997');
      expect(dollarBalanceAfter.gte(amountToRedeem)).to.be.true;

      const {minCollateralOutput, minShareOutput} = calculateRedeemMinOutputs(amountToRedeem);

      // 5. Approve the pool to spend creator's Dollar
      await execute(
        'Dollar',
        {from: creator.address, log: true},
        'approve',
        poolContract.address,
        amountToRedeem
      );

      console.log(
        `redeeming ${amountToRedeem.toString()}, minCollateralOutput: ${minCollateralOutput.toString()}, minShareOutput: ${minShareOutput.toString()}`
      );
      // 6. Redeem
      await execute(
        'PoolUSDC',
        {from: creator.address, log: true},
        'redeem',
        amountToRedeem,
        minShareOutput,
        minCollateralOutput
      );

      // 7. Check that USDC we have the pool reserve
      const poolCollateralBalance = await poolContract.redeem_collateral_balances(creator.address);
      expect(poolCollateralBalance.toString()).to.equal(amountToRedeem.toString());
    });
  });
});
