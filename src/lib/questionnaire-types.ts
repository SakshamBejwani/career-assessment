// Shapes of the versioned questionnaire content in src/content/questionnaires.
// These files are public (sent to the browser); scoring keys live elsewhere.

export type ResponseType = "single_choice" | "multi_select" | "boolean_checkbox";

export interface QuestionOption {
  key: string;
  text: string;
}

export interface QuestionItem {
  id: string;
  number?: number;
  sectionId: string;
  groupId: string;
  prompt: string;
  responseType: ResponseType;
  required: boolean;
  scored: boolean;
  options?: QuestionOption[];
  reviewFlag?: string;
}

export interface QuestionGroup {
  id: string;
  title: string | null;
}

export interface QuestionSection {
  id: string;
  title: string | null;
  groups: QuestionGroup[];
}

export interface Questionnaire {
  assessmentId: string;
  questionnaireVersion: string;
  name: string;
  sourceFile: string;
  sourceTitle: string;
  sourcePages: string;
  sourceStatus: string;
  instructions: string[];
  sections: QuestionSection[];
  items: QuestionItem[];
}

/** single_choice -> option key, multi_select -> option keys, boolean_checkbox -> boolean */
export type Answer = string | string[] | boolean;
export type AnswerMap = Record<string, Answer>;
