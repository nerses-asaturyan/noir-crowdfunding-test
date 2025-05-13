import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import {
  deriveKeys,
  Fr,
  DeployOptions,
  ContractInstanceWithAddress,
  ContractArtifact,
  SponsoredFeePaymentMethod,
  AztecAddress,
} from '@aztec/aztec.js';
import { CrowdfundingContract } from './Crowdfunding.ts';
import { getPXEs, logPXERegistrations, readData, updateData } from './utils.ts';
import { getSponsoredFPCInstance } from './fpc.ts';
import { CheatCodes } from '@aztec/aztec.js/testing';

const ethRpcUrl = 'http://localhost:8545';
async function main(): Promise<void> {
  const [pxe1, pxe2, pxe3] = await getPXEs(['pxe1', 'pxe2', 'pxe3']);
  const cc = await CheatCodes.create([ethRpcUrl], pxe3);

  const sponseredFPC = await getSponsoredFPCInstance();
  const paymentMethod = new SponsoredFeePaymentMethod(sponseredFPC.address);
  const data = readData();
  let secretKey = Fr.fromString(data.deployerSecertKey);
  let salt = Fr.fromString(data.deployerSalt);

  let schnorrAccount = await getSchnorrAccount(
    pxe3,
    secretKey,
    deriveSigningKey(secretKey),
    salt,
  );
  let deployerWallet = await schnorrAccount.getWallet();

  const crowdFundingSecretKey = Fr.random();
  const { publicKeys: crowdFundingPublicKeys } = await deriveKeys(
    crowdFundingSecretKey,
  );
  const deploymentOptions: DeployOptions = {
    contractAddressSalt: Fr.random(),
    universalDeploy: false,
    skipClassRegistration: false,
    skipPublicDeployment: false,
    skipInitialization: false,
    fee: { paymentMethod },
  };
  const now = await cc.eth.timestamp();

  const crowdFundingContract = await CrowdfundingContract.deployWithPublicKeys(
    crowdFundingPublicKeys,
    deployerWallet,
    data.tokenAddress,
    data.operatorAddress,
    BigInt(now + 24 * 60 * 60),
  )
    .send(deploymentOptions)
    .deployed();
  const crowdFundingPartialAddress = await crowdFundingContract.partialAddress;

  await pxe1.registerContract({
    instance: crowdFundingContract.instance as ContractInstanceWithAddress,
    artifact: CrowdfundingContract.artifact as ContractArtifact,
  });

  await pxe2.registerContract({
    instance: crowdFundingContract.instance as ContractInstanceWithAddress,
    artifact: CrowdfundingContract.artifact as ContractArtifact,
  });


  // register the crowdfunding account in pxe2 as an account since there are public keys
  await pxe2.registerAccount(crowdFundingSecretKey, crowdFundingPartialAddress);
  await pxe2.registerSender(deployerWallet.getAddress());

  await pxe3.registerContract({
    instance: crowdFundingContract.instance as ContractInstanceWithAddress,
    artifact: CrowdfundingContract.artifact as ContractArtifact,
  });

  // save data
  updateData({
    crowdFundingSecretKey: crowdFundingSecretKey,
    crowdFundingPublicKeys: crowdFundingPublicKeys,
    crowdFundingPartialAddress: crowdFundingPartialAddress,
    crowdFundingContractAddress: crowdFundingContract.address,
    crowdFundingInitHash: crowdFundingContract.instance.initializationHash,
  });

  await logPXERegistrations([pxe1, pxe2, pxe3]);
}

main().catch((err) => {
  console.error(`❌ Error: ${err}`);
  process.exit(1);
});
