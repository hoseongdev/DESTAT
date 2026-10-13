import { expect } from "chai";
import { keccak256, parseEther } from "ethers";
import { network } from "hardhat";

interface Question {
  question: string;
  options: string[];
}

describe("Survey init", () => {
  const title = "막무가내 설문조사라면";
  const description =
    "중앙화된 설문조사로서, 모든 데이터는 공개되지 않으며 설문조사를 게시한자만 볼 수 있습니다.";
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

  // poolAmount를 넘기면 그 금액을 담아 배포한다. rewardAmount = poolAmount / targetNumber
  const getSurveyContractAndEthers = async (survey: {
    title: string;
    description: string;
    targetNumber: number;
    questions: Question[];
    poolAmount?: bigint;
  }) => {
    const { ethers } = await network.connect();

    const cSurvey = await ethers.deployContract(
      "Survey",
      [survey.title, survey.description, survey.targetNumber, survey.questions],
      { value: survey.poolAmount ?? 0n },
    );

    return { ethers, cSurvey };
  };

  describe("Deployment", () => {
    it("should store survey info correctly", async () => {
      const targetNumber = 100;

      const { cSurvey } = await getSurveyContractAndEthers({
        title,
        description,
        targetNumber,
        questions,
      });

      expect(await cSurvey.title()).to.eq(title);
      expect(await cSurvey.description()).to.eq(description);
      expect(await cSurvey.targetNumber()).to.eq(targetNumber);
    });

    it("should calculate rewardAmount correctly", async () => {
      const targetNumber = 100;
      const poolAmount = parseEther("100");

      const { ethers, cSurvey } = await getSurveyContractAndEthers({
        title,
        description,
        targetNumber,
        questions,
        poolAmount,
      });

      expect(await cSurvey.rewardAmount()).to.eq(
        poolAmount / BigInt(targetNumber),
      );
      expect(await cSurvey.rewardAmount()).to.eq(parseEther("1"));

      // 예치금 전액이 컨트랙트에 남아 있어야 한다
      expect(
        await ethers.provider.getBalance(await cSurvey.getAddress()),
      ).to.eq(poolAmount);

      // 나누어떨어지지 않으면 정수 나눗셈이므로 내림 처리된다 (10 / 3 = 3)
      const { cSurvey: cTruncated } = await getSurveyContractAndEthers({
        title,
        description,
        targetNumber: 3,
        questions,
        poolAmount: 10n,
      });

      expect(await cTruncated.rewardAmount()).to.eq(3n);
    });
  });

  describe("Questions and Answers", () => {
    it("should return questions correctly", async () => {
      const { cSurvey } = await getSurveyContractAndEthers({
        title,
        description,
        targetNumber: 100,
        questions,
      });

      const storedQuestions = await cSurvey.getQuestions();

      expect(storedQuestions).to.have.lengthOf(questions.length);

      for (let i = 0; i < questions.length; i++) {
        expect(storedQuestions[i].question).to.eq(questions[i].question);
        expect(storedQuestions[i].options).to.deep.eq(questions[i].options);
      }
    });

    it("should allow valid answer submission", async () => {
      const { ethers, cSurvey } = await getSurveyContractAndEthers({
        title,
        description,
        targetNumber: 100,
        questions,
        poolAmount: parseEther("100"),
      });

      const [respondent] = await ethers.getSigners();

      expect(await cSurvey.getAnswers()).to.have.lengthOf(0);

      await cSurvey.connect(respondent).submitAnswer({
        respondent: respondent.address,
        answers: [1],
      });

      const savedAnswers = await cSurvey.getAnswers();

      expect(savedAnswers).to.have.lengthOf(1);
      expect(savedAnswers[0].respondent).to.eq(respondent.address);
      expect(savedAnswers[0].answers).to.deep.eq([1n]);
    });

    it("should revert if answer length mismatch", async () => {
      const { ethers, cSurvey } = await getSurveyContractAndEthers({
        title,
        description,
        targetNumber: 100,
        questions,
        poolAmount: parseEther("100"),
      });

      const [respondent] = await ethers.getSigners();

      // 질문은 1개인데 답변을 2개 보냈다
      await expect(
        cSurvey.connect(respondent).submitAnswer({
          respondent: respondent.address,
          answers: [1, 2],
        }),
      ).to.be.revertedWith("Mismatched answers length");

      expect(await cSurvey.getAnswers()).to.have.lengthOf(0);
    });

    it("should revert if target reached", async () => {
      const targetNumber = 1;

      const { ethers, cSurvey } = await getSurveyContractAndEthers({
        title,
        description,
        targetNumber,
        questions,
        poolAmount: parseEther("1"),
      });

      const [first, second] = await ethers.getSigners();

      await cSurvey.connect(first).submitAnswer({
        respondent: first.address,
        answers: [1],
      });

      expect(await cSurvey.getAnswers()).to.have.lengthOf(targetNumber);

      // 목표 인원이 찼으므로 두 번째 응답은 거절된다
      await expect(
        cSurvey.connect(second).submitAnswer({
          respondent: second.address,
          answers: [1],
        }),
      ).to.be.revertedWith("This survey has been ended");

      expect(await cSurvey.getAnswers()).to.have.lengthOf(targetNumber);
    });
  });

  describe("Rewards", () => {
    it("should pay correct reward to respondent", async () => {
      const targetNumber = 100;
      const poolAmount = parseEther("100");

      const { ethers, cSurvey } = await getSurveyContractAndEthers({
        title,
        description,
        targetNumber,
        questions,
        poolAmount,
      });

      const [respondent] = await ethers.getSigners();
      const surveyAddress = await cSurvey.getAddress();
      const rewardAmount = await cSurvey.rewardAmount();

      expect(rewardAmount).to.eq(parseEther("1"));

      const balanceBefore = await ethers.provider.getBalance(
        respondent.address,
      );

      const tx = await cSurvey.connect(respondent).submitAnswer({
        respondent: respondent.address,
        answers: [1],
      });

      const receipt = await tx.wait();

      if (receipt === null) {
        throw new Error("답변 제출 트랜잭션 영수증이 없습니다.");
      }

      // 응답자: 기존 잔액 + 보상 - 가스비
      expect(await ethers.provider.getBalance(respondent.address)).to.eq(
        balanceBefore + rewardAmount - receipt.fee,
      );

      // 컨트랙트: 예치금 - 보상
      expect(await ethers.provider.getBalance(surveyAddress)).to.eq(
        poolAmount - rewardAmount,
      );
    });
  });
});

it("Survey storage layout", async () => {
  const { ethers } = await network.create();

  const title = "막무가내 설문조사";
  const description =
    "중앙화된 설문조사로서, 모든 데이터는 공개되지 않으며 설문조사를 게시한자만 볼 수 있습니다.";

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

  const survey = await ethers.deployContract(
    "Survey",
    [title, description, 100, questions],
    {
      value: ethers.parseEther("100"),
    },
  );

  const slot0Data = await ethers.provider.getStorage(
    survey.getAddress(),
    ethers.toBeHex(0, 32),
  );
  const slot1Data = await ethers.provider.getStorage(
    survey.getAddress(),
    ethers.toBeHex(1, 32),
  );
  const slot2Data = await ethers.provider.getStorage(
    survey.getAddress(),
    ethers.toBeHex(2, 32),
  );
  const slot3Data = await ethers.provider.getStorage(
    survey.getAddress(),
    ethers.toBeHex(3, 32),
  );
  const slot4Data = await ethers.provider.getStorage(
    survey.getAddress(),
    ethers.toBeHex(4, 32),
  );
  const slot5Data = await ethers.provider.getStorage(
    survey.getAddress(),
    ethers.toBeHex(5, 32),
  );

  const decodeUni = (hex: string) =>
    Buffer.from(hex.slice(2), "hex").toString("utf-8");

  const nextHash = (hex: string, i: number) =>
    "0x" + (BigInt(hex) + BigInt(i)).toString(16);

  // primitive type
  console.log("primitive types");
  console.log(slot2Data);
  console.log(slot3Data);

  // long string type: 31바이트를 넘는 문자열은 slot에 포인터(길이)만 남고
  // 실제 데이터는 keccak256(slot번호)를 시작 위치로 하는 별도 slot에 저장된다.
  console.log("long string type");
  console.log(slot1Data); // 0x103 == 259 → (259-1)/2 = 129바이트
  const pDesc = keccak256(ethers.toBeHex(1, 32));
  const desc = await ethers.provider.getStorage(
    await survey.getAddress(),
    pDesc,
  );
  console.log(decodeUni(desc));

  // Array type: Question[] questions는 slot4에 length만 저장되고,
  // 실제 원소(구조체 2칸씩)는 keccak256(slot4)부터 순서대로 저장된다.
  // question1  <------------ pQuestions
  // question1_option[] <-- pQuestions + 1
  // question2  <------------ pQuestions + 2
  // question2_option[] <-- pQuestions + 3
  console.log("\n--- array type ---");
  console.log("slot4Data", slot4Data);
  const pQuestions = keccak256(ethers.toBeHex(4, 32));

  const question1 = await ethers.provider.getStorage(
    survey.getAddress(),
    nextHash(pQuestions, 0),
  );
  const question1_option_array = await ethers.provider.getStorage(
    survey.getAddress(),
    nextHash(pQuestions, 1),
  );
  const question2 = await ethers.provider.getStorage(
    survey.getAddress(),
    nextHash(pQuestions, 2),
  );
  const question2_option_array = await ethers.provider.getStorage(
    survey.getAddress(),
    nextHash(pQuestions, 3),
  );
  console.log("question1", question1);
  console.log("question1_option[]", question1_option_array);
  console.log("question2", question2, decodeUni(question2));
  console.log("question2_option[]", question2_option_array);
});
