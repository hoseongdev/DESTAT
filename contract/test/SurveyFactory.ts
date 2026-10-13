import { expect } from "chai";
import { network } from "hardhat";

interface Question {
  question: string;
  options: string[];
}

interface SurveySchema {
  title: string;
  description: string;
  targetNumber: bigint;
  questions: Question[];
}

type Connection = Awaited<ReturnType<typeof network.create>>;
type Signer = Awaited<ReturnType<Connection["ethers"]["getSigners"]>>[number];

describe("SurveyFactory Contract", () => {
  let ethers: Connection["ethers"];
  let factory: any;
  let owner: Signer;
  let respondent1: Signer;
  let respondent2: Signer;

  const minPoolAmount = () => ethers.parseEther("50");
  const minRewardAmount = () => ethers.parseEther("0.1");

  const sampleQuestions: Question[] = [
    {
      question: "누가 내 응답을 관리할때 더 솔직할 수 있을까요?",
      options: [
        "구글폼 운영자",
        "탈중앙화된 블록체인 (관리주체 없으며 모든 데이터 공개)",
        "상관없음",
      ],
    },
  ];

  function buildSurvey(targetNumber: bigint): SurveySchema {
    return {
      title: "막무가내 설문조사",
      description: "테스트용 설문조사입니다.",
      targetNumber,
      questions: sampleQuestions,
    };
  }

  beforeEach(async () => {
    ({ ethers } = await network.create());

    [owner, respondent1, respondent2] = await ethers.getSigners();

    factory = await ethers.deployContract("SurveyFactory", [
      ethers.parseEther("50"), // min_pool_amount
      ethers.parseEther("0.1"), // min_reward_amount
    ]);
  });

  it("should deploy with correct minimum amounts", async () => {
    expect(await factory.min_pool_amount()).to.eq(minPoolAmount());
    expect(await factory.min_reward_amount()).to.eq(minRewardAmount());
  });

  it("should create a new survey when valid values are provided", async () => {
    const targetNumber = 500n;
    const poolAmount = ethers.parseEther("50"); // 50 / 500 = 0.1 ETH per respondent

    const survey = buildSurvey(targetNumber);

    await expect(
      factory.createSurvey(survey, { value: poolAmount }),
    ).to.emit(factory, "SurveyCreated");

    expect(await factory.getSurveys()).to.have.lengthOf(1);
  });

  it("should revert if pool amount is too small", async () => {
    const targetNumber = 100n;
    const tooSmallPoolAmount = ethers.parseEther("10"); // < min_pool_amount (50)

    const survey = buildSurvey(targetNumber);

    await expect(
      factory.createSurvey(survey, { value: tooSmallPoolAmount }),
    ).to.be.revertedWith("Insufficient pool amount");
  });

  it("should revert if reward amount per respondent is too small", async () => {
    const targetNumber = 1000n; // 50 / 1000 = 0.05 ETH < min_reward_amount (0.1)
    const poolAmount = ethers.parseEther("50");

    const survey = buildSurvey(targetNumber);

    await expect(
      factory.createSurvey(survey, { value: poolAmount }),
    ).to.be.revertedWith("Insufficient reward amount");
  });

  it("should store created surveys and return them from getSurveys", async () => {
    const targetNumber = 500n;
    const poolAmount = ethers.parseEther("50");

    await factory.createSurvey(buildSurvey(targetNumber), {
      value: poolAmount,
    });
    await factory.createSurvey(buildSurvey(targetNumber), {
      value: poolAmount,
    });

    const surveys = await factory.getSurveys();

    expect(surveys).to.have.lengthOf(2);
    expect(surveys[0]).to.not.eq(surveys[1]);
    for (const surveyAddress of surveys) {
      expect(surveyAddress).to.not.eq(ethers.ZeroAddress);
    }
  });
});
