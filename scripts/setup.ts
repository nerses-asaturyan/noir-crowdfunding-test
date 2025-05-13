import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import {
  AztecAddress,
  Contract,
  Fr,
  SponsoredFeePaymentMethod,
} from '@aztec/aztec.js';
import { getPXEs, logPXERegistrations, updateData } from './utils.ts';
import { getSponsoredFPCInstance } from './fpc.ts';
import { SponsoredFPCContract } from '@aztec/noir-contracts.js/SponsoredFPC';
import { TokenContractArtifact } from '@aztec/noir-contracts.js/Token';

async function main(): Promise<void> {
  const [pxe1, pxe2, pxe3] = await getPXEs(['pxe1', 'pxe2', 'pxe3']);

  const sponsoredFPC = await getSponsoredFPCInstance();

  await pxe1.registerContract({
    instance: sponsoredFPC,
    artifact: SponsoredFPCContract.artifact,
  });

  await pxe2.registerContract({
    instance: sponsoredFPC,
    artifact: SponsoredFPCContract.artifact,
  });

  await pxe3.registerContract({
    instance: sponsoredFPC,
    artifact: SponsoredFPCContract.artifact,
  });

  const paymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);

  // Setup donor wallet in PXE 1
  // Generate random secret key and salt for the donor account
  let secretKey = Fr.random();
  let salt = Fr.random();
  let schnorrAccount = await getSchnorrAccount(
    pxe1,
    secretKey,
    deriveSigningKey(secretKey),
    salt,
  );
  let tx = await schnorrAccount.deploy({ fee: { paymentMethod } }).wait();
  let donorWallet = await schnorrAccount.getWallet();
  let donorAddress = donorWallet.getAddress();

  // Setup operator wallet in PXE 2
  // Generate random secret key and salt for the operator account
  let secretKey2 = Fr.random();
  let salt2 = Fr.random();
  let schnorrAccount2 = await getSchnorrAccount(
    pxe2,
    secretKey2,
    deriveSigningKey(secretKey2),
    salt2,
  );

  let tx2 = await schnorrAccount2.deploy({ fee: { paymentMethod } }).wait();
  let operatorWallet = await schnorrAccount2.getWallet();
  let operatorAddress = operatorWallet.getAddress();

  // Setup deployer wallet in PXE 3
  // Generate random secret key and salt for the deployer account
  let secretKey3 = Fr.random();
  let salt3 = Fr.random();
  let schnorrAccount3 = await getSchnorrAccount(
    pxe3,
    secretKey3,
    deriveSigningKey(secretKey3),
    salt3,
  );

  let tx3 = await schnorrAccount3.deploy({ fee: { paymentMethod } }).wait();
  let deployer = await schnorrAccount3.getWallet();
  let deployerAddress = deployer.getAddress();

  // Deploy the token contract with initial parameters
  const token = await Contract.deploy(deployer, TokenContractArtifact, [
    deployer.getAddress(),
    'DONATION',  // Token name
    'DNT',       // Token symbol
    18,          // Token decimals
  ])
    .send({ fee: { paymentMethod } })
    .deployed();

  // Register the token contract with PXE 1 and 2
  await pxe1.registerContract({
    instance: token.instance,
    artifact: TokenContractArtifact,
  });

  await pxe2.registerContract({
    instance: token.instance,
    artifact: TokenContractArtifact,
  });

  // Register the deployer as a sender for both donor and operator wallets
  await donorWallet.registerSender(deployerAddress);
  await operatorWallet.registerSender(deployerAddress);

  console.log(`Token deployed at ${token.address.toString()}`);

  // Mint initial token supply and distribute to donor and operator
  const amount = 2000n;
  console.log(`Minting ${amount} tokens...`);
  const contract3 = await Contract.at(
    AztecAddress.fromString(token.address.toString()),
    TokenContractArtifact,
    deployer,
  );
  
  // Mint tokens publicly to the deployer
  const mintTx = await contract3.methods
    .mint_to_public(deployer.getAddress(), amount)
    .send({ fee: { paymentMethod } })
    .wait();
  console.log(`Public mint successful in block ${mintTx.blockNumber}`);

  // Transfer tokens privately to donor and operator (split equally)
  await contract3.methods
    .transfer_to_private(donorWallet.getAddress(), amount / 2n)
    .send({ fee: { paymentMethod } })
    .wait();
  await contract3.methods
    .transfer_to_private(operatorWallet.getAddress(), amount / 2n)
    .send({ fee: { paymentMethod } })
    .wait();

  // Get contract instances for donor and operator to check balances
  const contract1 = await Contract.at(
    AztecAddress.fromString(token.address.toString()),
    TokenContractArtifact,
    donorWallet,
  );
  const contract2 = await Contract.at(
    AztecAddress.fromString(token.address.toString()),
    TokenContractArtifact,
    operatorWallet,
  );

  // Log private balances of donor and operator
  console.log(
    'donor private balance: ',
    await contract1.methods
      .balance_of_private(donorWallet.getAddress())
      .simulate(),
  );

  console.log(
    'operator private balance: ',
    await contract2.methods
      .balance_of_private(operatorWallet.getAddress())
      .simulate(),
  );

  // Save all important data (keys, addresses, etc.) for future use
  updateData({
    donorSecertKey: secretKey,
    donorSalt: salt,
    donorAddress: donorAddress,
    operatorSecertKey: secretKey2,
    operatorSalt: salt2,
    operatorAddress: operatorAddress,
    deployerSecertKey: secretKey3,
    deployerSalt: salt3,
    deployerAddress: deployerAddress,
    tokenAddress: token.address.toString(),
  });

  // Log all PXE registrations for verification
  await logPXERegistrations([pxe1, pxe2, pxe3]);
}

main().catch((err) => {
  console.error(`❌ Error: ${err}`);
  process.exit(1);
});
