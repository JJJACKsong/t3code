import { createFileRoute } from "@tanstack/react-router";

import { ThreadTokenAnalyticsPage } from "../components/usage/ThreadTokenAnalyticsPage";
import { tokenAnalyticsSearchFromUrl } from "../components/usage/threadTokenAnalytics.logic";

export const Route = createFileRoute("/_chat/token-analytics")({
  validateSearch: tokenAnalyticsSearchFromUrl,
  component: ThreadTokenAnalyticsPage,
});
