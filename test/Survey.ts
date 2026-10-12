import { expect } from "chai";
import { network } from "hardhat";

interface Question {
  question: string;
  options: string[];
}

it("Survey init", async () => {
  const { ethers } = await network.create();

  const title = "막무가내 설문조사";
  const description =
    "중앙화된 설문조사로서, 모든 데이터는 공개되지 않으며 설문조사를 게시한자만 볼 수 있습니다.";

  const targetNumber = 100n;
  const minPoolAmount = ethers.parseEther("50");
  const minRewardAmount = ethers.parseEther("0.1");
  const poolAmount = ethers.parseEther("100");
  const rewardAmount = poolAmount / targetNumber;

  const questions: Question[] = [
    {
      question: "누가 내 응답을 관리할때 더 솔직할 수 있을까요?",
      options: [
        "구글폼 운영자",
        "탈중앙화된 블록체인 (관리주체 없으며 모든 데이터 공개)",
        "상관없음",
      ],
    },
  ];

  // Factory 배포 및 최소 금액 검증
  const factory = await ethers.deployContract("SurveyFactory", [
    minPoolAmount,
    minRewardAmount,
  ]);
  await factory.waitForDeployment();

  expect(await factory.min_pool_amount()).to.eq(minPoolAmount);
  expect(await factory.min_reward_amount()).to.eq(minRewardAmount);
  expect(await factory.getSurveys()).to.have.lengthOf(0);

  // 100 ETH를 전달하면서 설문 생성
  const tx = await factory.createSurvey(
    {
      title,
      description,
      targetNumber,
      questions,
    },
    {
      value: poolAmount,
    },
  );

  const receipt = await tx.wait();

  if (receipt === null) {
    throw new Error("설문 생성 트랜잭션 영수증이 없습니다.");
  }

  // SurveyCreated 이벤트에서 설문 주소 추출
  const factoryAddress = await factory.getAddress();
  let surveyAddress: string | undefined;

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== factoryAddress.toLowerCase()) {
      continue;
    }

    const event = factory.interface.parseLog(log);

    if (event?.name === "SurveyCreated") {
      surveyAddress = event.args[0];
      break;
    }
  }

  if (surveyAddress === undefined) {
    throw new Error("SurveyCreated 이벤트가 발생하지 않았습니다.");
  }

  await expect(tx).to.emit(factory, "SurveyCreated").withArgs(surveyAddress);

  const surveys = await factory.getSurveys();

  expect(surveys).to.have.lengthOf(1);
  expect(surveys[0]).to.eq(surveyAddress);

  // 생성된 Survey에 연결
  const survey = await ethers.getContractAt("Survey", surveyAddress);

  // storage slot 확인: title, description, targetNumber, rewardAmount,
  // questions, answers 순서로 선언되어 slot 0~5에 각각 대응된다.
  const slot0Data = await ethers.provider.getStorage(
    surveyAddress,
    ethers.toBeHex(0, 32),
  );
  const slot1Data = await ethers.provider.getStorage(
    surveyAddress,
    ethers.toBeHex(1, 32),
  );
  const slot2Data = await ethers.provider.getStorage(
    surveyAddress,
    ethers.toBeHex(2, 32),
  );
  const slot3Data = await ethers.provider.getStorage(
    surveyAddress,
    ethers.toBeHex(3, 32),
  );
  const slot4Data = await ethers.provider.getStorage(
    surveyAddress,
    ethers.toBeHex(4, 32),
  );
  const slot5Data = await ethers.provider.getStorage(
    surveyAddress,
    ethers.toBeHex(5, 32),
  );
  console.log(slot0Data);
  console.log(slot1Data);
  console.log(slot2Data);
  console.log(slot3Data);
  console.log(slot4Data);
  console.log(slot5Data);

  expect(await survey.title()).to.eq(title);
  expect(await survey.description()).to.eq(description);
  expect(await survey.targetNumber()).to.eq(targetNumber);
  expect(await survey.rewardAmount()).to.eq(rewardAmount);

  expect(await ethers.provider.getBalance(surveyAddress)).to.eq(poolAmount);
  expect(await ethers.provider.getBalance(factoryAddress)).to.eq(0n);

  // 질문 및 선택지 검증
  const storedQuestions = await survey.getQuestions();

  expect(storedQuestions).to.have.lengthOf(questions.length);

  for (let i = 0; i < questions.length; i++) {
    expect(storedQuestions[i].question).to.eq(questions[i].question);
    expect(storedQuestions[i].options).to.deep.eq(questions[i].options);
  }

  // 응답 제출 전 잔액 확인
  const [respondent] = await ethers.getSigners();

  expect(await survey.getAnswers()).to.have.lengthOf(0);

  const balanceBefore = await ethers.provider.getBalance(respondent.address);

  // connect()가 반환한 인스턴스로 제출
  const submitTx = await survey.connect(respondent).submitAnswer({
    respondent: respondent.address,
    answers: [1],
  });

  const submitReceipt = await submitTx.wait();

  if (submitReceipt === null) {
    throw new Error("답변 제출 트랜잭션 영수증이 없습니다.");
  }

  // 저장된 답변 검증
  const savedAnswers = await survey.getAnswers();

  expect(savedAnswers).to.have.lengthOf(1);
  expect(savedAnswers[0].respondent).to.eq(respondent.address);
  expect(savedAnswers[0].answers).to.deep.eq([1n]);

  // 응답자 잔액: 기존 잔액 + 1 ETH 보상 - 가스비
  const balanceAfter = await ethers.provider.getBalance(respondent.address);

  expect(rewardAmount).to.eq(ethers.parseEther("1"));
  expect(balanceAfter).to.eq(balanceBefore + rewardAmount - submitReceipt.fee);

  // 보상 지급 후 설문 잔액은 99 ETH
  expect(await ethers.provider.getBalance(surveyAddress)).to.eq(
    poolAmount - rewardAmount,
  );
});
