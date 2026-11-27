import type { EnvironmentId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import {
  buildPendingUserInputAnswers,
  setPendingUserInputCustomAnswer,
  togglePendingUserInputOptionSelection,
  type PendingUserInputDraftAnswer,
} from "@t3tools/client-runtime/state/pending-user-input";
import { act, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

import type { PendingUserInput } from "../../lib/threadActivity";

const harness = vi.hoisted(() => ({
  navigate: [] as Array<[string, object | undefined]>,
  openedUrls: [] as string[],
}));

type Children = { children?: ReactNode };

vi.mock("react-native", () => ({
  Platform: { OS: process.env.T3_MOBILE_TEST_PLATFORM === "android" ? "android" : "ios" },
  View: ({ children }: Children) => <div>{children}</div>,
  ScrollView: ({ children }: Children) => <div>{children}</div>,
  Pressable: ({
    children,
    onPress,
    accessibilityState,
    accessibilityRole,
    disabled,
  }: Children & {
    onPress?: () => void;
    accessibilityRole?: "checkbox" | "radio";
    accessibilityState?: { checked?: boolean };
    disabled?: boolean;
  }) => (
    <button
      type="button"
      role={accessibilityRole}
      aria-checked={accessibilityState?.checked}
      disabled={disabled}
      onClick={onPress}
    >
      {children}
    </button>
  ),
}));
vi.mock("react-native-reanimated", () => {
  const animation = { duration: () => ({ easing: () => ({}) }) };
  return {
    default: { View: ({ children }: Children) => <div>{children}</div> },
    Easing: { out: () => () => 0, cubic: () => 0 },
    FadeInUp: animation,
    FadeOutDown: animation,
    useAnimatedStyle: () => ({}),
    useSharedValue: (value: number) => ({ value, set: () => {} }),
  };
});
vi.mock("../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../components/ui/AppText", () => ({
  AppText: ({ children }: Children) => <span>{children}</span>,
}));
vi.mock("../../components/ui/ControlPill", () => ({ ControlPill: () => null }));
vi.mock("../../components/ui/Button", () => ({
  Button: (props: { label: string; disabled?: boolean; onPress: () => void }) => (
    <button type="button" disabled={props.disabled} onClick={props.onPress}>
      {props.label}
    </button>
  ),
}));
vi.mock("./QuestionAttachments", () => ({
  QuestionAttachments: (props: { value: string; onChangeText: (value: string) => void }) => (
    <textarea
      value={props.value}
      onInput={(event) => props.onChangeText(event.currentTarget.value)}
    />
  ),
}));
vi.mock("../files/FileMarkdownPreview", () => ({
  useMarkdownPreviewStyles: () => ({ nativeTextStyle: {} }),
}));
vi.mock("../../native/SelectableMarkdownText", () => ({
  SelectableMarkdownText: (props: { markdown: string; onLinkPress?: (href: string) => void }) => (
    <p>
      {[...props.markdown.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(([, label, href]) => (
        <button key={href} type="button" onClick={() => props.onLinkPress?.(href!)}>
          {label}
        </button>
      ))}
    </p>
  ),
}));
vi.mock("../../state/entities", () => ({
  useLiveThreadLinkLabels: (markdown: string) => markdown,
}));
vi.mock("../../native/useOpenPullRequest", () => ({
  useOpenPullRequest: () => async (url: string) => {
    harness.openedUrls.push(url);
    return true;
  },
}));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: (name: string, params?: object) => harness.navigate.push([name, params]),
  }),
}));

import { PendingUserInputCard } from "./PendingUserInputCard";

function setup(
  questionMarkdown: string,
  questionFields: Partial<PendingUserInput["questions"][number]> = {},
) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.navigate = [];
  harness.openedUrls = [];

  const question: PendingUserInput["questions"][number] = {
    id: "question-1",
    header: "Review",
    question: questionMarkdown,
    options: [],
    multiSelect: false,
    allowCustomAnswer: false,
    ...questionFields,
  };
  const pendingUserInput: PendingUserInput = {
    requestId: "request-1" as RuntimeRequestId,
    createdAt: "2026-01-01T00:00:00.000Z",
    responseCapability: "live",
    dismissible: false,
    questions: [question],
  };
  const onSubmit = vi.fn();
  function Card() {
    const [drafts, setDrafts] = useState<Record<string, PendingUserInputDraftAnswer>>({});
    const answers = buildPendingUserInputAnswers(pendingUserInput.questions, drafts);
    return (
      <PendingUserInputCard
        environmentId={"env-1" as EnvironmentId}
        threadId={"thread-1" as ThreadId}
        workspaceRoot="/repo"
        canOperateThread
        pendingUserInput={pendingUserInput}
        maxHeight={{ value: 600 } as never}
        cardProgress={{ value: 1, set: () => {} } as never}
        cardCoverage={{ value: 0, set: () => {} } as never}
        collapsed={false}
        onToggleCollapsed={() => {}}
        drafts={drafts}
        answers={answers}
        respondingUserInputId={null}
        onSelectOption={(_requestId, selectedQuestion, value) =>
          setDrafts((current) => ({
            ...current,
            [selectedQuestion.id]: togglePendingUserInputOptionSelection(
              selectedQuestion,
              current[selectedQuestion.id],
              value,
            ),
          }))
        }
        onChangeCustomAnswer={(_requestId, questionId, value) =>
          setDrafts((current) => ({
            ...current,
            [questionId]: setPendingUserInputCustomAnswer(question, current[questionId], value),
          }))
        }
        onSubmit={async () => onSubmit(answers)}
        onDismiss={async () => {}}
      />
    );
  }

  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<Card />));
  const button = (label: string) => {
    const element = [...container.querySelectorAll("button")].find(
      (entry) => entry.textContent === label,
    );
    if (!element) throw new Error(`No button labelled ${label}`);
    return element;
  };
  const input = () => {
    const element = container.querySelector("textarea");
    if (!element) throw new Error("No custom answer field");
    return element;
  };
  return {
    button,
    input,
    onSubmit,
    async press(label: string) {
      await act(async () => button(label).click());
    },
    changeText(text: string) {
      act(() => {
        const element = input();
        element.value = text;
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });
    },
    [Symbol.dispose]() {
      act(() => root.unmount());
    },
  };
}

it("opens a workspace file link in a question in the thread's file viewer", async () => {
  using screen = setup("Should I update [probe.md](docs/probe.md:12)?");

  await screen.press("probe.md");

  expect(harness.openedUrls).toEqual([]);
  expect(harness.navigate).toEqual([
    [
      "ThreadFile",
      { environmentId: "env-1", threadId: "thread-1", path: ["docs", "probe.md"], line: "12" },
    ],
  ]);
});

it("keeps multi-select choices and supplemental text together through submission", async () => {
  using screen = setup("Which platforms?", {
    multiSelect: true,
    allowCustomAnswer: true,
    options: [
      { label: "Web", value: "web", description: "Web" },
      { label: "Mobile", value: "mobile", description: "Mobile" },
    ],
  });

  await screen.press("Web");
  screen.changeText("Include desktop");
  expect(screen.button("Web").getAttribute("aria-checked")).toBe("true");
  await screen.press("Mobile");
  expect(screen.input().value).toBe("Include desktop");
  expect(screen.button("Mobile").getAttribute("aria-checked")).toBe("true");

  await screen.press("Submit answers");
  expect(screen.onSubmit).toHaveBeenCalledWith({
    "question-1": ["web", "mobile", "Include desktop"],
  });
});

it("can submit an unselected optional choice", async () => {
  using screen = setup("Include extras?", {
    required: false,
    options: [
      { label: "Yes", value: "true", description: "Yes" },
      { label: "No", value: "false", description: "No" },
    ],
  });

  expect(screen.button("Submit answers").disabled).toBe(false);
  await screen.press("Submit answers");
  expect(screen.onSubmit).toHaveBeenCalledWith({});
});
