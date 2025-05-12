import {
  AztecAddress,
  Contract,
  Fr,
  SponsoredFeePaymentMethod,
  Wallet,
} from '@aztec/aztec.js';
import { CrowdfundingContract } from './Crowdfunding.ts';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { readData, getPXEs } from './utils.ts';
import { getSponsoredFPCInstance } from './fpc.ts';
import { getSchnorrAccount } from '@aztec/accounts/schnorr';

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

  const sender: string = senderWallet.getAddress().toString();
  console.log(`Using wallet: ${sender}`);

  const token = data.tokenAddress;
  const amount = 23n;

  const TokenContractArtifact = TokenContract.artifact;
  const asset = await Contract.at(
    AztecAddress.fromString(token),
    TokenContractArtifact,
    senderWallet as Wallet,
  );

  const transfer = asset
    .withWallet(senderWallet)
    .methods.transfer_in_private(
      senderWallet.getAddress(),
      AztecAddress.fromString(data.crowdFundingContractAddress),
      amount,
      0n,
    );

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

  const tx = await contract.methods
    .donate(amount)
    .send({ authWitnesses: [witness], fee: { paymentMethod } })
    .wait();

  const txEffect = await pxe1.getTxEffect(tx.txHash);
  console.log('TxEffect: ', txEffect.data.privateLogs);

  console.log('tx : ', tx);
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
