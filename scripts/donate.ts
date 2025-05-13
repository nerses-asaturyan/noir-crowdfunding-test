import {
  AztecAddress,
  Contract,
  Fr,
  getWallet,
  SponsoredFeePaymentMethod,
  Wallet,
} from '@aztec/aztec.js';
import { CrowdfundingContract } from './Crowdfunding.ts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { readData, getPXEs } from './utils.ts';
import { getSponsoredFPCInstance } from './fpc.ts';
import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { SingleKeyAccountContract } from '@aztec/accounts/single_key';

const CrowdfundingContractArtifact = CrowdfundingContract.artifact;

async function main(): Promise<void> {
  const [pxe1, pxe2, pxe3] = await getPXEs(['pxe1', 'pxe2', 'pxe3']);
  const sponseredFPC = await getSponsoredFPCInstance();
  const paymentMethod = new SponsoredFeePaymentMethod(sponseredFPC.address);

  const data = readData();
  let donorSecertKey = Fr.fromString(data.donorSecertKey);
  let donorSalt = Fr.fromString(data.donorSalt);
  const schnorWallet = await getSchnorrAccount(
    pxe1,
    donorSecertKey,
    deriveSigningKey(donorSecertKey),
    donorSalt,
  );
  const senderWallet = await schnorWallet.getWallet();

  let operatorSecertKey = Fr.fromString(data.operatorSecertKey);
  let operatorSalt = Fr.fromString(data.operatorSalt);
  const operatorAccount = await getSchnorrAccount(
    pxe2,
    operatorSecertKey,
    deriveSigningKey(operatorSecertKey),
    operatorSalt,
  );
  const operatorWallet = await operatorAccount.getWallet();

  const sender: string = senderWallet.getAddress().toString();
  console.log(`Using wallet: ${sender}`);

  const crowdFundingContract = new SingleKeyAccountContract(data.crowdFundingSecretKey)
  const crowdFundingWallet = await getWallet(pxe2, AztecAddress.fromString(data.crowdFundingContractAddress), crowdFundingContract);

  await crowdFundingWallet.registerSender(senderWallet.getAddress());
  await crowdFundingWallet.registerSender(operatorWallet.getAddress());  
  
  const token = data.tokenAddress;
  const amount = 23n;

  const TokenContractArtifact = TokenContract.artifact;
  const asset = await Contract.at(
    AztecAddress.fromString(token),
    TokenContractArtifact,
    senderWallet as Wallet,
  );

  // from donor to crowdfunding contract
  const transfer = asset
    .withWallet(senderWallet)
    .methods.transfer_in_private(
      senderWallet.getAddress(),
      AztecAddress.fromString(data.crowdFundingContractAddress),
      amount,
      0n,
    );

  // authorize crowdfunding contract to spend tokens
  const witness = await senderWallet.createAuthWit({
    caller: AztecAddress.fromString(data.crowdFundingContractAddress),
    action: transfer,
  });

  console.log(
    `private balance of sender ${senderWallet.getAddress()}: `,
    await asset.methods
      .balance_of_private(senderWallet.getAddress())
      .simulate(),
  );
  const contract = await Contract.at(
    AztecAddress.fromString(data.crowdFundingContractAddress),
    CrowdfundingContractArtifact,
    senderWallet,
  );

  // donate to crowdfunding contract from donor
  const tx = await contract.methods
    .donate(amount)
    .send({ authWitnesses: [witness], fee: { paymentMethod } })
    .wait();

  const txEffect = await pxe1.getTxEffect(tx.txHash);

  console.log(
    `private balance of sender ${senderWallet.getAddress()}: `,
    await asset.methods
      .balance_of_private(senderWallet.getAddress())
      .simulate(),
  );

}

main().catch((err: any) => {
  console.error(`Error: ${err}`);
  process.exit(1);
});
