import { ID, Int } from "akanjs/base";
import { via } from "akanjs/constant";

export class QuizInput extends via((field) => ({
  userId: field(ID, { ref: "user", immutable: true }),
})) {}

export class QuizObject extends via(QuizInput, (field) => ({
  correctNum: field(Int, { default: 0, min: 0 }),
})) {
  static maxNum = 4; // @flag
  static readonly minNum = 1; // @flag
  private static secretNum = 2; // @flag
  static { // @flag
    QuizObject.maxNum += 1;
  }
}

export class LightQuiz extends via(
  QuizObject,
  ["userId", "correctNum"] as const,
  (resolve) => ({}),
) {
  static choiceNum = 4; // @flag
  static xpOfCorrect(comboNum: number) { // @flag
    return comboNum * 10;
  }
  static async loadAll() { // @flag
    return [];
  }
  static get defaultNum() { // @flag
    return 1;
  }
  isPerfect() {
    return this.correctNum === 4;
  }
}

export class LightRenamed extends via(QuizObject, ["userId"] as const, (resolve) => ({})) {
  static sizeNum = 1; // @flag
}

export class Quiz extends via(QuizObject, LightQuiz, (resolve) => ({})) {}
