import { usePage } from "@apps/akan/client";
import { Link } from "akanjs/ui";
import { FaDiscord, FaGithub } from "react-icons/fa";

export const AkanjsFooter = () => {
  const { l } = usePage();
  return (
    <div className="border-base-content/20 border-t bg-base-100 text-base-100">
      <div className="container flex flex-col items-center justify-between gap-2 pt-8 pb-16">
        <div className="flex gap-6 text-3xl">
          <Link
            href="https://github.com/akan-team/akanjs"
            target="_blank"
            rel="noopener noreferrer"
            className="text-base-content! duration-300 hover:text-primary"
          >
            <FaGithub />
          </Link>
          <Link
            href="https://discord.gg/pc228BhWmM"
            target="_blank"
            rel="noopener noreferrer"
            className="text-base-content! duration-300 hover:text-primary"
          >
            <FaDiscord />
          </Link>
        </div>
        <div className="text-base-content/50 text-sm md:text-base">
          {l.trans({ en: "Released under the MIT License", ko: "MIT 라이선스 하에 배포되었습니다." })}
        </div>
        <div className="text-base-content/50 text-sm md:text-base">
          {l.trans({ en: "Official Akan.js Consulting on", ko: "Akan.js 공식 컨설팅 서비스" })}

          <Link href="https://soft.akanjs.com" target="_blank" rel="noopener noreferrer">
            <span className="ml-1 font-bold text-primary">Akansoft</span>
          </Link>
        </div>
        <div className="text-base-content/50 text-sm md:text-base">
          {l.trans({
            en: "Copyright © 2026 Akan.js All rights reserved.",
            ko: "Copyright © 2026 Akan.js 모든 권리 보유.",
          })}
        </div>
        <div className="text-base-content/50 text-sm md:text-base">
          {l.trans({ en: "System managed by", ko: "시스템 관리자" })}
          <Link href="https://github.com/aka-bassman" target="_blank" rel="noopener noreferrer">
            <span className="ml-1 font-bold text-primary">bassman</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
