import type { RouteObject } from "react-router-dom";
import { AppLayout } from "../components/layout/AppLayout";
import { AboutPage } from "../pages/AboutPage";
import { HomePage } from "../pages/HomePage";
import { LabPage } from "../pages/LabPage";
import { PlaceholderPage } from "../pages/PlaceholderPage";
import { SettingsPage } from "../pages/SettingsPage";

export const appRoutes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "lab", element: <LabPage /> },
      {
        path: "guided",
        element: (
          <PlaceholderPage
            description="Step-by-step positioning exercises will connect named views to the live geometry controls."
            heading="Guided views"
            label="Guided learning"
          />
        ),
      },
      {
        path: "guided/:viewId",
        element: (
          <PlaceholderPage
            description="A future guided sequence will explain the positioning cues and geometric checks for this view."
            heading="Wrist true lateral"
            label="Guided view preview"
          />
        ),
      },
      {
        path: "library",
        element: (
          <PlaceholderPage
            description="A curated collection of synthetic teaching cases will support comparison and reflection."
            heading="Case library"
            label="Learning cases"
          />
        ),
      },
      {
        path: "library/:caseId",
        element: (
          <PlaceholderPage
            description="This future case view will combine a synthetic setup, learning goals, and reflection notes."
            heading="Wrist neutral case"
            label="Case preview"
          />
        ),
      },
      {
        path: "communication",
        element: (
          <PlaceholderPage
            description="Future prompts will help learners practise concise, unambiguous C-arm positioning language."
            heading="Communication practice"
            label="Team language"
          />
        ),
      },
      {
        path: "saved",
        element: (
          <PlaceholderPage
            description="Saved views, bookmarks, and notes will remain private to this browser."
            heading="Saved learning"
            label="Local collection"
          />
        ),
      },
      { path: "about", element: <AboutPage /> },
      { path: "settings", element: <SettingsPage /> },
      {
        path: "*",
        element: (
          <PlaceholderPage
            description="The requested learning page is not available in this prototype."
            heading="Page not found"
            label="OrthoFluoro Lab"
          />
        ),
      },
    ],
  },
];
