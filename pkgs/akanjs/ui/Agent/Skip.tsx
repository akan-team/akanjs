import type { ReactNode } from "react";

export interface SkipProps {
  className?: string;
  /**
   * What `readScreen` prints in place of the region, and the name `section` takes to read it anyway. Required
   * because the marker is the whole point: an unnamed one tells the agent a region exists and nothing about it.
   */
  label: string;
  children: ReactNode;
}

/**
 * A region the default `readScreen` leaves out, for chrome that costs the agent tokens and answers nothing — a
 * footer, a cookie banner, a repeated nav. What stands in its place is `[skipped: <label>]`, so an agent asked
 * about the footer says it did not read one instead of reporting that the page has none, and `section: "<label>"`
 * reads it on request.
 *
 * **This hides text, not behaviour.** Tools and state keys are declarations, not markup: an `st.tool` inside here
 * is published exactly as before, and `highlight` still reaches a control in here. It renders a wrapper element,
 * so where a div between a flex container and its children would move the layout, put the attribute on the element
 * the page already renders — `<footer data-agent-skip="site footer">`.
 */
export const Skip = ({ className, label, children }: SkipProps) => {
  return (
    <div className={className} data-agent-skip={label}>
      {children}
    </div>
  );
};
