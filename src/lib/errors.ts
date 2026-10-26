/** Turns raw API/network messages into plain language with a next step. */
export function friendlyError(raw: string): string {
  if (/ANTHROPIC_API_KEY/.test(raw))
    return "This copy of the app isn't connected to Claude yet. Whoever runs it needs to add an API key (see the README). Your answers are saved here.";
  if (/TAVILY_API_KEY|Research is on/.test(raw))
    return "Web research isn't set up on this copy of the app. Turn research off for this PRD, or add a search key (see the README).";
  if (/429|rate|overloaded|529/i.test(raw))
    return "Claude is busy right now. Wait a moment and press Retry. Your answers are saved.";
  if (/failed to fetch|network|load failed/i.test(raw))
    return "Couldn't reach the app's server. Check that it's still running, then press Retry. Your answers are saved.";
  return "Something went wrong while Claude was replying. Press Retry. If it keeps happening, copy your last answer and start a new run. Your answers are saved.";
}
