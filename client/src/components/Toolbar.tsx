import { useEditorState, type Editor } from '@tiptap/react';
import { Bold, Italic, List, ListOrdered, Redo2, Strikethrough, TextQuote, Underline, Undo2, type LucideIcon } from 'lucide-react';

type Btn = { icon: LucideIcon; title: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick: () => void };

function ToolButton({ icon: Icon, title, shortcut, active, disabled, onClick }: Btn) {
  const label = shortcut ? `${title} (${shortcut})` : title;
  return (
    <button type="button" title={label} aria-label={title} aria-pressed={active}
      className={`tool ${active ? 'active' : ''}`} disabled={disabled}
      onMouseDown={(e) => e.preventDefault() /* keep editor selection */} onClick={onClick}>
      <Icon size={17} strokeWidth={2.1} />
    </button>
  );
}

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

export function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'), strike: e.isActive('strike'),
      bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'), quote: e.isActive('blockquote'),
      heading: ([1, 2, 3] as const).find((level) => e.isActive('heading', { level })) ?? 0,
      canUndo: e.can().undo(), canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  function setBlock(value: string) {
    const level = Number(value);
    if (level === 0) chain().setParagraph().run();
    else chain().setHeading({ level: level as 1 | 2 | 3 }).run();
  }

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <div className="tool-group">
        <ToolButton icon={Undo2} title="Undo" shortcut={`${mod}Z`} disabled={!s.canUndo} onClick={() => chain().undo().run()} />
        <ToolButton icon={Redo2} title="Redo" shortcut={`${mod}Shift+Z`} disabled={!s.canRedo} onClick={() => chain().redo().run()} />
      </div>
      <div className="tool-group">
        <select className="style-select" aria-label="Text style" value={s.heading} onChange={(e) => setBlock(e.target.value)}>
          <option value={0}>Normal text</option>
          <option value={1}>Heading 1</option>
          <option value={2}>Heading 2</option>
          <option value={3}>Heading 3</option>
        </select>
      </div>
      <div className="tool-group">
        <ToolButton icon={Bold} title="Bold" shortcut={`${mod}B`} active={s.bold} onClick={() => chain().toggleBold().run()} />
        <ToolButton icon={Italic} title="Italic" shortcut={`${mod}I`} active={s.italic} onClick={() => chain().toggleItalic().run()} />
        <ToolButton icon={Underline} title="Underline" shortcut={`${mod}U`} active={s.underline} onClick={() => chain().toggleUnderline().run()} />
        <ToolButton icon={Strikethrough} title="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()} />
      </div>
      <div className="tool-group">
        <ToolButton icon={List} title="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()} />
        <ToolButton icon={ListOrdered} title="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()} />
        <ToolButton icon={TextQuote} title="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()} />
      </div>
    </div>
  );
}
