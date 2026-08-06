import { Navigate, type RouteObject } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { CArmGeometryReviewPage } from "../pages/CArmGeometryReviewPage";
import { LabPage } from "../pages/LabPage";
import { ProjectionRendererSmokePage } from "../pages/ProjectionRendererSmokePage";

const retiredPaths = [
  "lab",
  "guided",
  "guided/:viewId",
  "library",
  "library/:caseId",
  "communication",
  "saved",
  "about",
  "settings",
] as const;

const diagnosticRoutes: RouteObject[] =
  import.meta.env.VITE_ENABLE_DIAGNOSTIC_ROUTES === "true"
    ? [
        {
          path: "lab/c-arm-review",
          element: <CArmGeometryReviewPage />,
        },
        {
          path: "lab/projection-renderer-smoke",
          element: <ProjectionRendererSmokePage />,
        },
      ]
    : [];

export const appRoutes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <LabPage /> },
      ...retiredPaths.map((path) => ({
        path,
        element: <Navigate replace to="/" />,
      })),
      ...diagnosticRoutes,
      { path: "*", element: <Navigate replace to="/" /> },
    ],
  },
];
