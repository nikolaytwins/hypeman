import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Сборка на CI, на сервер — только артефакт standalone (меньше RAM/CPU на VPS). */
  output: "standalone",
};

export default nextConfig;
