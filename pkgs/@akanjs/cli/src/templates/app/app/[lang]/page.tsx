import type { AppInfo, LibInfo } from "@akanjs/devkit";

interface Dict {
  appName: string;
}
export default function getContent(scanInfo: AppInfo | LibInfo | null, dict: Dict) {
  return {
    filename: "page.tsx",
    content: `
import {
  FaBolt,
  FaBook,
  FaCloudUploadAlt,
  FaCode,
  FaExternalLinkAlt,
  FaGraduationCap,
  FaHeart,
  FaShieldAlt,
} from "react-icons/fa";

export const metadata = {
  title: "Akan.js",
};

export default function Page() {
  return (
    <div className="bg-base-100 flex min-h-screen items-center justify-center">
      <div className="container mx-auto px-4 py-16">
        <div className="mb-16 text-center">
          <h1 className="mb-6 text-6xl font-bold">Akan.js</h1>
          <p className="mx-auto max-w-2xl text-lg">A typescript full-stack framework designed for solo developers</p>
          <p className="mx-auto max-w-2xl text-lg">that enables building servers, web, and apps all at once</p>
          <p className="mx-auto max-w-2xl text-lg">making in-house development with minimal resources.</p>
          <div className="my-8 flex flex-wrap justify-center gap-4">
            <div className="badge badge-lg text-base-100 bg-primary border-none">
              <FaBolt className="" />
              All-in-One
            </div>
            <div className="badge badge-lg text-base-100 bg-secondary border-none">
              <FaShieldAlt className="" />
              Type-Safe
            </div>
            <div className="badge badge-lg text-base-100 bg-success border-none">
              <FaHeart className="" />
              Minimal-Code
            </div>
          </div>
        </div>
        <div className="mb-12 text-center">
          <button className="btn btn-primary btn-lg bg-primary border-none px-12 py-4 text-lg font-semibold">
            <FaCloudUploadAlt className="mr-3 text-xl" />
            Deploy Now
          </button>
        </div>
        <div className="mb-16 rounded-lg bg-slate-800 p-8">
          <h2 className="text-gray-200 mb-6 text-center text-2xl font-bold">Quick Start</h2>
          <div className="mockup-code">
            <pre data-prefix="$">
              <code className="text-success">npx create-akan-workspace</code>
            </pre>
            <pre data-prefix="$">
              <code className="text-success">cd my-workspace</code>
            </pre>
            <pre data-prefix="$">
              <code className="text-success">akan start my-app</code>
            </pre>
          </div>
        </div>
        <div className="mb-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="card bg-slate-800">
            <div className="card-body p-6 text-center">
              <FaBook className="mx-auto mb-4 text-4xl text-purple-400" />
              <h3 className="text-gray-200 mb-2 text-lg font-semibold">Documentation</h3>
              <p className="mb-4 text-sm text-gray-400">Complete API guides and tutorials</p>
              <button className="btn btn-sm w-full">Read Documentation</button>
            </div>
          </div>
          <div className="card bg-slate-800">
            <div className="card-body p-6 text-center">
              <FaGraduationCap className="mx-auto mb-4 text-4xl text-blue-400" />
              <h3 className="text-gray-200 mb-2 text-lg font-semibold">Learn</h3>
              <p className="mb-4 text-sm text-gray-400">Step-by-step learning guides</p>
              <button className="btn btn-sm w-full">Learn</button>
            </div>
          </div>
          <div className="card bg-slate-800">
            <div className="card-body p-6 text-center">
              <FaCode className="mx-auto mb-4 text-4xl text-green-400" />
              <h3 className="text-gray-200 mb-2 text-lg font-semibold">Examples</h3>
              <p className="mb-4 text-sm text-gray-400">Real project examples</p>
              <button className="btn btn-sm w-full">Examples</button>
            </div>
          </div>
          <div className="card bg-slate-800">
            <div className="card-body p-6 text-center">
              <FaExternalLinkAlt className="mx-auto mb-4 text-4xl text-yellow-400" />
              <h3 className="text-gray-200 mb-2 text-lg font-semibold">Official Site</h3>
              <p className="mb-4 text-sm text-gray-400">Visit our official website</p>
              <button className="btn btn-sm w-full">Go to akanjs.com</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
  `,
  };
}
