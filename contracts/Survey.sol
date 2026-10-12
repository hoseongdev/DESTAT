// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

struct Question {
  string question;
  string[] options;
}

struct Answer {
  address respondent;
  uint8[] answers;
}

contract Survey {
  string public title;
  string public description;
  uint256 public targetNumber;
  uint256 public rewardAmount;

  Question[] questions;
  Answer[] answers;

  // primitive: int, bool, uint
  // memory, storage, calldata
  constructor(
    string memory _title,
    string memory _description,
    uint256 _targetNumber,
    Question[] memory _questions
  ) payable {
    require(_targetNumber > 0, "Invalid target number");

    title = _title;
    description = _description;
    targetNumber = _targetNumber;
    rewardAmount = msg.value / _targetNumber;

    for (uint i = 0; i < _questions.length; i++) {
      questions.push(
        Question({
          question: _questions[i].question,
          options: _questions[i].options
        })
      );
    }
  }

  function submitAnswer(Answer calldata _answer) external {
    require(
      _answer.answers.length == questions.length,
      "Mismatched answers length"
    );
    require(answers.length < targetNumber, "This survey has been ended");

    answers.push(
      Answer({respondent: _answer.respondent, answers: _answer.answers})
    );

    payable(msg.sender).transfer(rewardAmount);
  }

  function getAnswers() external view returns (Answer[] memory) {
    return answers;
  }

  function getQuestions() external view returns (Question[] memory) {
    return questions;
  }
}
