import { assert, describe, it } from "@effect/vitest";

import { parseElicitationForm, withOptionalChoices } from "./elicitationForm.ts";

describe("parseElicitationForm", () => {
  for (const type of ["string", "array"] as const) {
    it.each([
      { values: [" padded ", "", "plain"], labels: ["padded", '""', "plain"] },
      { values: [" a", "a", "b"], labels: ['" a"', '"a"', "b"] },
      { values: [" a", "a", '"a"'], labels: ['" a"', '"a"', '"\\"a\\""'] },
    ])(
      `preserves ${type} enum values with distinct readable labels: $values`,
      ({ values, labels }) => {
        const form = parseElicitationForm(
          {
            type: "object",
            properties: {
              answer:
                type === "array"
                  ? { type, items: { type: "string", enum: values } }
                  : { type, enum: values },
            },
            required: ["answer"],
          },
          "Choose",
        );
        assert(form !== undefined);
        const question = form.questions[0];
        assert(question !== undefined);
        assert.deepStrictEqual(
          question.options.map((option) => option.label),
          labels,
        );
        assert.deepStrictEqual(
          question.options.map((option) => option.value),
          values,
        );
        assert.strictEqual(question.allowCustomAnswer, false);
        assert.strictEqual(question.multiSelect, type === "array" ? true : undefined);
        for (const value of values) {
          const answer = type === "array" ? [value] : value;
          assert.deepStrictEqual(form.content({ answer }), { answer });
        }
      },
    );
  }

  it("asks each question once when a choice has a free-text companion field", () => {
    // OMP's ask dialog follows each choice `q<n>` with a free-text `q<n>__other` field.
    const ask = (question: string, header: string) => ({
      type: "string",
      title: question,
      description: header,
      oneOf: [
        { const: "Yes", title: "Yes" },
        { const: "No", title: "No" },
      ],
    });
    const form = parseElicitationForm(
      {
        type: "object",
        properties: {
          q0: ask("Use Postgres for the new service?", "Database"),
          q0__other: { type: "string", title: "Other (type your own)" },
          q1: ask("Deploy to staging first?", "Deploy"),
          q1__other: { type: "string", title: "Other (type your own)" },
        },
      },
      "Answer 2 questions",
    );
    assert(form !== undefined);
    assert.deepStrictEqual(
      form.questions.map((question) =>
        [question.header, question.question].some((text) => text.endsWith("?")),
      ),
      [true, true],
    );
    assert.deepStrictEqual(form.content({ q0: "Yes", q1: "Only on Fridays" }), {
      q0: "Yes",
      q1__other: "Only on Fridays",
    });

    // A single-underscore `<id>_other` companion folds the same way.
    const singleUnderscore = parseElicitationForm(
      {
        type: "object",
        properties: {
          q0: ask("Use Postgres for the new service?", "Database"),
          q0_other: { type: "string", title: "Other" },
        },
      },
      "Answer 1 question",
    );
    assert(singleUnderscore !== undefined);
    assert.deepStrictEqual(
      singleUnderscore.questions.map((question) => question.id),
      ["q0"],
    );
    assert.deepStrictEqual(singleUnderscore.content({ q0: "Only on Fridays" }), {
      q0_other: "Only on Fridays",
    });

    assert.deepStrictEqual(form.content({}), {});
    assert.deepStrictEqual(singleUnderscore.content({ q0: "Yes" }), { q0: "Yes" });
    assert.deepStrictEqual(singleUnderscore.content({}), {});
  });

  const multiItems = { type: "string", enum: ["web", "mobile"] };
  const attachment = 'Attached file "notes.md": "/tmp/notes.md"';

  it.each(["targets_other", "targets__other"])(
    "folds %s into a multi-select question",
    (companion) => {
      const form = parseElicitationForm(
        {
          type: "object",
          properties: {
            targets: { type: "array", items: multiItems, maxItems: 1 },
            [companion]: { type: "string", title: "Other" },
          },
        },
        "Choose targets",
      );
      assert(form !== undefined);
      assert.deepStrictEqual(
        form.questions.map(({ id, multiSelect, allowCustomAnswer }) => [
          id,
          multiSelect,
          allowCustomAnswer,
        ]),
        [["targets", true, undefined]],
      );
      assert.deepStrictEqual(form.content({}), {});
      assert.deepStrictEqual(form.content({ targets: [] }), { targets: [] });
      assert.deepStrictEqual(form.content({ targets: "" }), {});
      assert.deepStrictEqual(form.content({ targets: [" ", 3] }), {});
      assert.deepStrictEqual(form.content({ targets: ["web", "web"] }), { targets: ["web"] });
      assert.deepStrictEqual(form.content({ targets: "Desktop" }), { [companion]: "Desktop" });
      assert.deepStrictEqual(form.content({ targets: [attachment] }), { [companion]: attachment });
      assert.deepStrictEqual(form.content({ targets: ["web", "Desktop", attachment] }), {
        targets: ["web"],
        [companion]: `Desktop\n\n${attachment}`,
      });
      assert.isUndefined(form.content({ targets: ["web", "Desktop", "mobile"] }));
    },
  );

  it("writes the required array when its minimum is zero and only custom text is supplied", () => {
    const form = parseElicitationForm(
      {
        type: "object",
        properties: {
          targets: { type: "array", items: multiItems, minItems: 0 },
          targets_other: { type: "string" },
        },
        required: ["targets"],
      },
      "Choose targets",
    );
    assert(form !== undefined);
    assert.lengthOf(form.questions, 1);
    assert.isUndefined(form.content({}));
    assert.isUndefined(form.content({ targets: [" ", 3] }));
    assert.deepStrictEqual(form.content({ targets: "" }), { targets: [] });
    assert.deepStrictEqual(form.content({ targets: [] }), { targets: [] });
    assert.deepStrictEqual(form.content({ targets: "Desktop" }), {
      targets: [],
      targets_other: "Desktop",
    });
    assert.deepStrictEqual(form.content({ targets: [attachment] }), {
      targets: [],
      targets_other: attachment,
    });
  });

  it("enforces selection bounds on a multi-select with a positive minimum", () => {
    const properties = {
      targets: { type: "array", items: multiItems, minItems: 2 },
      targets_other: { type: "string" },
    };
    const required = parseElicitationForm(
      { type: "object", properties, required: ["targets"] },
      "Choose targets",
    );
    assert(required !== undefined);
    assert.deepStrictEqual(
      required.questions.map(({ id, required }) => [id, required]),
      [
        ["targets", true],
        ["targets_other", false],
      ],
    );
    assert.isUndefined(required.content({ targets: "Desktop" }));
    assert.deepStrictEqual(
      required.content({ targets: ["web", "mobile"], targets_other: "Desktop" }),
      { targets: ["web", "mobile"], targets_other: "Desktop" },
    );

    const optional = parseElicitationForm({ type: "object", properties }, "Choose targets");
    assert(optional !== undefined);
    assert.lengthOf(optional.questions, 1);
    assert.deepStrictEqual(optional.content({}), {});
    assert.deepStrictEqual(optional.content({ targets: "Desktop" }), { targets_other: "Desktop" });
    assert.deepStrictEqual(optional.content({ targets: [] }), {});
    assert.deepStrictEqual(optional.content({ targets: ["web", "mobile", "Desktop"] }), {
      targets: ["web", "mobile"],
      targets_other: "Desktop",
    });
    assert.isUndefined(optional.content({ targets: ["web", "Desktop"] }));
  });

  it("requires a multi-select only for a required minimum and accepts none otherwise", () => {
    const items = { type: "string", enum: ["web", "mobile"] };
    const form = parseElicitationForm(
      {
        type: "object",
        properties: {
          targets: { type: "array", minItems: 1, items },
          extras: { type: "array", items },
          platforms: { type: "array", minItems: 1, items },
        },
        required: ["targets"],
      },
      "Choose",
    );
    assert(form !== undefined);
    assert.deepStrictEqual(
      form.questions.map((question) => [question.id, question.required]),
      [
        ["targets", true],
        ["extras", undefined],
        ["platforms", undefined],
      ],
    );
    assert.deepStrictEqual(form.content({ targets: ["web"], extras: [], platforms: [] }), {
      targets: ["web"],
      extras: [],
    });
  });

  it("marks optional number and integer fields as not required and omits blank answers", () => {
    const form = parseElicitationForm(
      {
        type: "object",
        properties: {
          limit: { type: "integer" },
          ratio: { type: "number" },
          retries: { type: "integer" },
          threshold: { type: "number" },
        },
        required: ["retries", "threshold"],
      },
      "Configure limits",
    );
    assert(form !== undefined);
    assert.deepStrictEqual(
      form.questions.map((question) => [question.id, question.required]),
      [
        ["limit", false],
        ["ratio", false],
        ["retries", undefined],
        ["threshold", undefined],
      ],
    );
    assert.deepStrictEqual(form.content({ limit: "", ratio: "", retries: "3", threshold: "0.5" }), {
      retries: 3,
      threshold: 0.5,
    });
    assert.isUndefined(form.content({ limit: "", ratio: "", retries: "", threshold: "0.5" }));
  });

  it("lets optional boolean and single-choice fields be skipped", () => {
    const form = parseElicitationForm(
      {
        type: "object",
        properties: {
          extras: { type: "boolean" },
          mode: { type: "string", enum: ["", "fast"] },
          confirm: { type: "boolean" },
          tier: { type: "string", enum: ["free", "pro"] },
        },
        required: ["confirm", "tier"],
      },
      "Configure run",
    );
    assert(form !== undefined);
    assert.deepStrictEqual(
      form.questions.map((question) => [question.id, question.required]),
      [
        ["extras", false],
        ["mode", false],
        ["confirm", undefined],
        ["tier", undefined],
      ],
    );
    assert.deepStrictEqual(form.content({ confirm: "true", tier: "pro" }), {
      confirm: true,
      tier: "pro",
    });
    assert.deepStrictEqual(
      form.content({ extras: "false", mode: "", confirm: "true", tier: "pro" }),
      { extras: false, mode: "", confirm: true, tier: "pro" },
    );
    assert.isUndefined(form.content({ extras: "true", tier: "pro" }));
  });
});

describe("withOptionalChoices", () => {
  const choice = (id: string) => ({
    id,
    header: id,
    question: id,
    options: [{ label: "Fast", description: "Fast", value: "fast" }],
  });
  const form = withOptionalChoices(
    {
      questions: [
        choice("mode"),
        choice("tier"),
        { ...choice("tags"), multiSelect: true },
        { ...choice("notes"), options: [] },
      ],
      respond: (answers) => ({ action: "accept", content: { answered: Object.keys(answers) } }),
    },
    {
      type: "object",
      properties: {
        mode: { type: "string" },
        tier: { type: "string" },
        tags: { type: "array" },
        notes: { type: "string" },
      },
      required: ["tier"],
    },
  );

  it("marks only the single choices the schema leaves optional", () => {
    assert.deepStrictEqual(
      form.questions.map((question) => [question.id, question.required]),
      [
        ["mode", false],
        ["tier", undefined],
        ["tags", undefined],
        ["notes", undefined],
      ],
    );
  });

  it("answers without a skipped choice and cancels without a required one", () => {
    assert.deepStrictEqual(form.respond({ tier: "fast" }), {
      action: "accept",
      content: { answered: ["tier"] },
    });
    assert.deepStrictEqual(form.respond({ mode: "fast" }), { action: "cancel" });
  });
});
