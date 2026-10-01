"use client";

import { useNavigationGuard } from "@/components/NavigationGuard";
import { ShotlistEditor } from "@/components/ShotlistEditor";

/** The editor for a new shotlist, starting over when "New Shotlist" is clicked while already here. */
export function NewShotlistEditor(props: React.ComponentProps<typeof ShotlistEditor>) {
  const { resetKey } = useNavigationGuard();
  return <ShotlistEditor key={resetKey} {...props} />;
}
