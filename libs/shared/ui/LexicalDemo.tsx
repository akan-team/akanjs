"use client";
import { type cnst, fetch } from "@libs/shared/client";
import { Editor, mentionEditorPlugin } from "@libs/shared/ui";
import { buttonRecipe } from "@libs/util/ui";
import { useMemo, useState } from "react";
import type { EditorPlugin } from "./Editor";
import { mockAddFilesGql } from "./lexicalDemo.util";

const LEGACY_YOOPTA_VALUE = {
  "block-1": {
    id: "block-1",
    type: "Paragraph",
    meta: { order: 0, depth: 0 },
    value: [{ id: "el-1", type: "paragraph", children: [{ text: "레거시 Yoopta 데이터 (렌더되면 안 됨)" }] }],
  },
};
const MENTION_ROWS = 8;

interface LexicalDemoProps {
  plugins?: EditorPlugin[];
}
export const LexicalDemo = ({ plugins = [] }: LexicalDemoProps) => {
  // `initialValue` is read only at (re)mount; bump `editorKey` to force a remount when injecting a preset.
  const [initialValue, setInitialValue] = useState<unknown>(undefined);
  const [editorKey, setEditorKey] = useState(0);
  // Updated on every keystroke — proves the change→serialize pipeline.
  const [liveJson, setLiveJson] = useState<unknown>(undefined);
  // Snapshot fed to the read-only render (manual, to avoid remounting on every keystroke).
  const [mirrorJson, setMirrorJson] = useState<unknown>(undefined);
  const [mirrorKey, setMirrorKey] = useState(0);
  // Attachments reconciled from the live document (proves the fileId walk + reconcile).
  const [attachments, setAttachments] = useState<cnst.File[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Mentionable models. `adminListInMention` sits behind the Admin guard, so the
  // menu only returns rows on an admin-authenticated route.
  const editorPlugins = useMemo(
    () => [
      ...plugins,
      mentionEditorPlugin([
        {
          refName: "admin",
          label: "Admin",
          keywords: ["관리자", "staff"],
          search: async (query) => {
            const admins = await fetch.adminListInMention(query, 0, MENTION_ROWS, "relevance");
            return admins.map((admin) => ({
              refId: admin.id,
              label: admin.accountId.split("@")[0] ?? admin.accountId,
              description: admin.roles.join(", "),
            }));
          },
        },
      ]),
    ],
    [plugins],
  );

  const remountWith = (value: unknown) => {
    setInitialValue(value);
    setLiveJson(value);
    setEditorKey((k) => k + 1);
  };

  const renderReadonly = () => {
    setMirrorJson(liveJson);
    setMirrorKey((k) => k + 1);
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-black text-3xl tracking-tight">Lexical 에디터 데모 (Phase 1–3b)</h1>
        <p className="text-foreground/60 text-sm leading-6">
          한글로 자유롭게 입력해 IME 조합·undo/redo·직렬화를 확인하세요. 우측에 실시간 JSON이 표시됩니다. 하단 버튼으로
          fail-safe(레거시 데이터 → 빈 상태)와 읽기전용 렌더를 확인할 수 있습니다.
        </p>
      </header>

      <details className="rounded-lg border border-foreground/15 bg-muted/50 p-4 text-sm">
        <summary className="cursor-pointer font-semibold">사용법 (인터랙션·마크·블록·마크다운 단축입력)</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1 font-semibold text-foreground/80">인터랙션 (Phase 2)</p>
            <ul className="list-disc pl-5 text-foreground/60 leading-6">
              <li>
                <code>/</code> 입력 → 슬래시 메뉴(블록 검색·↑↓·Enter)
              </li>
              <li>텍스트 드래그 선택 → 플로팅 툴바(마크·링크)</li>
              <li>
                링크: 선택 후{" "}
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">⌘/Ctrl</kbd> + K
                또는 툴바 Link
              </li>
              <li>블록 왼쪽 hover → 핸들(＋추가 / ⠿드래그 이동 · 클릭 시 복제·삭제)</li>
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold text-foreground/80">미디어 (Phase 3)</p>
            <ul className="list-disc pl-5 text-foreground/60 leading-6">
              <li>
                <code>/</code> → Image / Video / File(업로드) · Embed(YouTube·Vimeo URL) · Callout
              </li>
              <li>파일 드래그&드롭 / 이미지 붙여넣기 → 자동 업로드·삽입</li>
              <li>미디어 클릭 → 정렬(좌·중·우) / Fit·Fill / 크기 리셋 / 삭제, 좌우 핸들로 리사이즈</li>
              <li>콜아웃 내부 클릭 → 5색 변형 스위처</li>
              <li>업로드는 데모용 mock(로컬 object URL) — 서버 없이 동작</li>
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold text-foreground/80">구조 블록 (Phase 3b)</p>
            <ul className="list-disc pl-5 text-foreground/60 leading-6">
              <li>
                <code>/</code> → Table(3×3) · Toggle(아코디언) · Excalidraw(손그림) · Mermaid(코드 다이어그램)
              </li>
              <li>표: 셀 클릭 → 플로팅 툴바(행·열 추가/삭제, 헤더 토글, 표 삭제), Tab 이동</li>
              <li>토글: 제목/본문 편집, ▸ 클릭으로 열고닫기(상태 저장)</li>
              <li>Excalidraw: 이미지처럼 표시 — 클릭/선택 → 플로팅 메뉴(정렬·Edit·초기화·삭제), 좌우 핸들로 폭 조절</li>
              <li>
                Mermaid: 선택 → Edit로 전체화면 소스 편집(실시간 미리보기·문법 오류 표시), 라이트/다크 테마 자동 반영
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold text-foreground/80">키보드 마크</p>
            <ul className="list-disc pl-5 text-foreground/60 leading-6">
              <li>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">⌘/Ctrl</kbd> + B
                / I / U — 볼드 / 이탤릭 / 밑줄
              </li>
              <li>취소선·코드·하이라이트는 아래 마크다운으로</li>
            </ul>
          </div>
          <div>
            <p className="mb-1 font-semibold text-foreground/80">마크다운 단축입력 (줄 시작)</p>
            <ul className="list-disc pl-5 text-foreground/60 leading-6">
              <li>
                <code>#</code> <code>##</code> <code>###</code> + 공백 → 제목 1~3
              </li>
              <li>
                <code>-</code> <code>*</code> → 불릿, <code>1.</code> → 번호, <code>[] </code> → 체크박스
              </li>
              <li>
                <code>&gt;</code> → 인용, <code>```</code> → 코드블록, <code>```mermaid</code> → 다이어그램,{" "}
                <code>---</code> → 구분선
              </li>
              <li>
                인라인: <code>**볼드**</code> <code>*이탤릭*</code> <code>~~취소선~~</code> <code>`코드`</code>{" "}
                <code>==하이라이트==</code>
              </li>
              <li>
                링크: <code>[텍스트](https://...)</code>, URL 자동 링크
              </li>
            </ul>
          </div>
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonRecipe({ size: "sm", variant: "outline" })}
          onClick={() => remountWith(undefined)}
        >
          비우기 (새 문서)
        </button>
        <button
          type="button"
          className={buttonRecipe({ size: "sm", variant: "warning", outline: true })}
          onClick={() => remountWith(LEGACY_YOOPTA_VALUE)}
        >
          레거시 Yoopta 주입 → fail-safe 확인
        </button>
        <button type="button" className={buttonRecipe({ size: "sm", variant: "primary" })} onClick={renderReadonly}>
          현재 내용 읽기전용으로 렌더 →
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-foreground/80 text-sm">편집 (Editor.Rich)</h2>
          <div className="min-h-[16rem] rounded-lg border border-foreground/15 bg-background p-4">
            <Editor.Rich
              key={editorKey}
              value={initialValue}
              plugins={editorPlugins}
              onChange={(val) => setLiveJson(val)}
              addFilesGql={mockAddFilesGql}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              onUploadError={(error) => setUploadError(error.message)}
              placeholder="여기에 한글로 입력해보세요… (예: 안녕하세요, 리치 텍스트 에디터입니다)"
              height="12rem"
            />
          </div>
          <p className="text-foreground/50 text-xs">
            첨부(reconcile): {attachments.length}개
            {attachments.length > 0 ? ` — ${attachments.map((file) => file.filename).join(", ")}` : ""}
            {uploadError ? <span className="ml-2 text-destructive">업로드 오류: {uploadError}</span> : null}
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-semibold text-foreground/80 text-sm">실시간 직렬화 (onChange → SerializedEditorState)</h2>
          <pre className="min-h-[16rem] overflow-auto rounded-lg border border-foreground/15 bg-muted p-4 font-mono text-xs leading-5">
            {liveJson ? JSON.stringify(liveJson, null, 2) : "// 아직 입력이 없습니다"}
          </pre>
        </section>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-foreground/80 text-sm">읽기전용 렌더 (Editor.RichContent)</h2>
        <div className="min-h-[6rem] rounded-lg border border-foreground/15 bg-background p-4">
          {mirrorJson ? (
            <Editor.RichContent key={mirrorKey} content={mirrorJson} />
          ) : (
            <p className="text-foreground/40 text-sm">
              "현재 내용 읽기전용으로 렌더" 버튼을 누르면 위 편집 내용이 여기에 읽기전용으로 표시됩니다.
            </p>
          )}
        </div>
      </section>
    </div>
  );
};
