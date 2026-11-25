import { describe, it, expect } from "vitest";
import { act, render } from "@testing-library/react";
import { ResearchWorkspaceProvider, useResearchWorkspace } from "./ResearchWorkspaceContext";

/**
 * Regression for the Notebook render loop: NotebookPdfWorkspace registers an
 * action object from an effect. If the provider returned a fresh context value
 * for an unchanged registration, that effect re-ran and kept the Notebook page
 * (and eventually the whole desktop session) busy.
 */
describe("ResearchWorkspaceProvider identity guards", () => {
  it("does not re-render consumers for identical notebook actions/headings", () => {
    const observedActions: object[] = [];
    const observedHeadings: object[] = [];
    let register!: (actions: { compilePdf?: () => void }) => void;
    let setHeadings!: (headings: { label: string; line: number }[]) => void;

    function Probe() {
      const workspace = useResearchWorkspace();
      observedActions.push(workspace.notebookActions);
      observedHeadings.push(workspace.sectionHeadings);
      register ??= workspace.registerNotebookActions;
      setHeadings ??= workspace.setSectionHeadings;
      return null;
    }

    render(
      <ResearchWorkspaceProvider>
        <Probe />
      </ResearchWorkspaceProvider>
    );
    const rendersAfterMount = observedActions.length;

    const compilePdf = () => {};
    act(() => {
      register({ compilePdf });
      setHeadings([{ label: "Intro", line: 1 }]);
    });
    const rendersAfterChange = observedActions.length;
    expect(rendersAfterChange).toBeGreaterThan(rendersAfterMount);

    act(() => {
      // New object instances, identical content/functions: must be a no-op.
      register({ compilePdf });
      setHeadings([{ label: "Intro", line: 1 }]);
    });
    expect(observedActions.length).toBe(rendersAfterChange);
    expect(observedHeadings.length).toBe(rendersAfterChange);
    expect(observedActions.at(-1)).toBe(observedActions[rendersAfterChange - 1]);
    expect(observedHeadings.at(-1)).toEqual([{ label: "Intro", line: 1 }]);
  });
});
