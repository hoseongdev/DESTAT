import {
  type RouteConfig,
  index,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  index("features/dashboard/pages/dashboard.tsx"),
  route("/survey/all", "features/survey/pages/all-survey.tsx"),
  route("/survey/create", "features/survey/pages/create-survey.tsx"),
  route("/archive/finish", "features/archive/pages/finished-survey.tsx"),
  route("/profile/survey", "features/profile/pages/my-survey.tsx"),
  route("/profile/response", "features/profile/pages/my-response.tsx"),
] satisfies RouteConfig;
