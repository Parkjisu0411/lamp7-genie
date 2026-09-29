import {
    ChevronDown,
    ChevronUp,
    ClipboardPaste,
    Copy,
    EyeOff,
    GripVertical,
    List,
    PanelRightOpen,
    Play,
    Trash2,
    X,
} from 'lucide-react';
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EditPresentation } from './editPresentation';

export interface EditWorkspaceItem {
    key: string;
    type: string;
    icon?: ReactNode;
    /** Position in the complete source logic, never the selection/clipboard index. */
    seq?: string;
    label: string;
    id: string;
    hidden?: boolean;
}
interface Props {
    active: boolean;
    pasting?: boolean;
    busy?: string;
    items: EditWorkspaceItem[];
    copied: EditWorkspaceItem[];
    notice?: string;
    onStart(): void;
    onStop(): void;
    onCopy(): void;
    onDelete(): void;
    onPaste(): void;
    onClear(): void;
    onDeselect(id: string): void;
}

/** The same controls and compact rows serve both editors, in-panel and in the compact bar. */
export function EditWorkspace(props: Props) {
    const presentation = useContext(EditPresentation);
    const [fallbackCompact, setFallbackCompact] = useState(false);
    const compact = presentation?.compact ?? fallbackCompact;
    const setCompact = presentation?.setCompact ?? setFallbackCompact;
    const [list, setList] = useState<'selected' | 'copied' | null>(null);
    const [copiedExpanded, setCopiedExpanded] = useState(true);
    const [position, setPosition] = useState({ x: 8, y: 8 });
    const bar = useRef<HTMLDivElement>(null);
    const previousActive = useRef(false);
    const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
    const { active, pasting, busy, items, copied } = props;
    useEffect(() => {
        if (active !== previousActive.current) {
            setCompact(active);
            setList(null);
        }
        previousActive.current = active;
    }, [active, setCompact]);
    useEffect(() => {
        const clamp = () =>
            setPosition((p) => ({
                x: Math.max(
                    8,
                    Math.min(p.x, window.innerWidth - (bar.current?.offsetWidth ?? 320) - 8),
                ),
                y: Math.max(
                    8,
                    Math.min(p.y, window.innerHeight - (bar.current?.offsetHeight ?? 44) - 8),
                ),
            }));
        const observer = new ResizeObserver(clamp);
        if (bar.current) observer.observe(bar.current);
        window.addEventListener('resize', clamp);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', clamp);
        };
    }, [compact]);
    const toggleList = (kind: 'selected' | 'copied') => setList(list === kind ? null : kind);
    const showSelected = active && !pasting;
    const shownList =
        list === 'selected' && showSelected ? 'selected' : list === 'copied' ? 'copied' : null;
    const listItems = shownList === 'selected' ? items : copied;
    const rows = (entries: EditWorkspaceItem[], removable: boolean) => (
        <ul className="genie-edit-items" aria-label={removable ? '선택 목록' : '복사 목록'}>
            {entries.map((item) => {
                const name = item.label || item.id || '이름 없음';
                const showId = item.label && item.label !== item.id && item.id;
                const sequence =
                    item.seq === undefined
                        ? ''
                        : `${removable ? '전체' : '원본 전체'} 로직 ${item.seq ? `${item.seq}번` : '순번 없음'}`;
                const details = [
                    sequence,
                    item.type,
                    name,
                    showId && item.id,
                    item.hidden && '숨김 항목 포함',
                ]
                    .filter(Boolean)
                    .join(' · ');
                return (
                    <li key={item.key} className="genie-edit-item" title={details}>
                        {item.seq !== undefined && (
                            <span className="genie-edit-seq" aria-label={sequence}>
                                {item.seq || '–'}
                            </span>
                        )}
                        {item.icon ? (
                            <span
                                className="genie-edit-kind-icon"
                                role="img"
                                aria-label={item.type}
                                title={item.type}
                            >
                                {item.icon}
                            </span>
                        ) : (
                            <span className="genie-edit-kind" title={item.type}>
                                {item.type}
                            </span>
                        )}
                        <span className="genie-edit-item__text">
                            <strong>{name}</strong>
                            {showId && <code>{item.id}</code>}
                        </span>
                        {item.hidden && (
                            <span
                                className="genie-edit-hidden"
                                title="숨김 항목 포함"
                                aria-label="숨김 항목 포함"
                            >
                                <EyeOff size={13} aria-hidden="true" /> 숨김
                            </span>
                        )}
                        {removable && (
                            <button
                                type="button"
                                className="genie-edit-icon"
                                disabled={!!busy}
                                aria-label={`${sequence ? `${sequence} · ` : ''}${name} 선택 해제`}
                                title="선택 해제"
                                onClick={() => props.onDeselect(item.key)}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </li>
                );
            })}
        </ul>
    );
    const controls = (
        <>
            {!active && (
                <button type="button" disabled={!!busy} onClick={props.onStart}>
                    <Play size={14} />
                    선택 시작
                </button>
            )}
            {showSelected && (
                <>
                    <button
                        type="button"
                        onClick={() => toggleList('selected')}
                        aria-expanded={shownList === 'selected'}
                    >
                        <List size={14} />
                        선택 {items.length}
                    </button>
                    <button type="button" disabled={!!busy || !items.length} onClick={props.onCopy}>
                        <Copy size={14} />
                        복사
                    </button>
                    <button
                        type="button"
                        className="genie-edit-danger"
                        disabled={!!busy || !items.length}
                        onClick={props.onDelete}
                    >
                        <Trash2 size={14} />
                        삭제
                    </button>
                </>
            )}
            {!active && copied.length > 0 && (
                <button type="button" disabled={!!busy} onClick={props.onPaste}>
                    <ClipboardPaste size={14} />
                    붙여넣기
                </button>
            )}
            {active && (
                <button type="button" disabled={!!busy} onClick={props.onStop}>
                    <X size={14} />
                    {pasting ? '취소' : '종료'}
                </button>
            )}
        </>
    );
    const notice = presentation?.notice;
    const details = shownList && (
        <section
            className="genie-edit-popover"
            aria-label={shownList === 'selected' ? '선택한 항목' : '복사한 항목'}
        >
            <header>
                <strong>
                    {shownList === 'selected' ? '선택' : '복사'} {listItems.length}개
                </strong>
                {shownList === 'selected' && items.length > 0 && (
                    <button type="button" disabled={!!busy} onClick={props.onClear}>
                        전체 해제
                    </button>
                )}
                <button
                    type="button"
                    className="genie-edit-icon"
                    aria-label="목록 닫기"
                    onClick={() => setList(null)}
                >
                    <X size={14} />
                </button>
            </header>
            {listItems.length ? (
                rows(listItems, shownList === 'selected')
            ) : (
                <p className="genie-edit-hint">선택한 항목 없음</p>
            )}
        </section>
    );
    const copiedButton = !active && copied.length > 0 && (
        <button
            type="button"
            onClick={() =>
                compact ? toggleList('copied') : setCopiedExpanded((expanded) => !expanded)
            }
            aria-expanded={compact ? shownList === 'copied' : copiedExpanded}
        >
            <List size={14} />
            복사 {copied.length}
            {!compact && (copiedExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
        </button>
    );
    if (!compact)
        return (
            <div className="genie-edit-workspace">
                <div className="genie-edit-controls">{controls}</div>
                <p className="genie-edit-hint" role="status">
                    {busy ||
                        (pasting
                            ? '넣을 위치를 클릭하세요.'
                            : active
                              ? '클릭 · 드래그로 선택'
                              : '클릭 · 드래그로 여러 항목 선택')}
                </p>
                {copied.length > 0 && !active && (
                    <section className="genie-edit-clipboard">
                        <header>{copiedButton}</header>
                        {copiedExpanded && rows(copied, false)}
                    </section>
                )}
                {props.notice && (
                    <p className="genie-edit-hint" role="status">
                        {props.notice}
                    </p>
                )}
                {shownList === 'selected' && details}
                {active && (
                    <button type="button" className="panel__btn" onClick={() => setCompact(true)}>
                        작게 보기
                    </button>
                )}
            </div>
        );
    const root = document.getElementById('lamp7-genie-root');
    const content = (
        <div className="genie-edit-dock" ref={bar} style={{ left: position.x, top: position.y }}>
            <div className="genie-edit-bar" role="toolbar" aria-label="지니 편집">
                <button
                    type="button"
                    className="genie-edit-grip"
                    aria-label="조작 바 이동"
                    title="드래그로 이동 · 방향키로 이동"
                    onKeyDown={(e) => {
                        const dx = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
                        const dy = e.key === 'ArrowUp' ? -16 : e.key === 'ArrowDown' ? 16 : 0;
                        if (!dx && !dy) return;
                        e.preventDefault();
                        setPosition((p) => ({
                            x: Math.max(
                                8,
                                Math.min(
                                    innerWidth - (bar.current?.offsetWidth ?? 320) - 8,
                                    p.x + dx,
                                ),
                            ),
                            y: Math.max(
                                8,
                                Math.min(
                                    innerHeight - (bar.current?.offsetHeight ?? 44) - 8,
                                    p.y + dy,
                                ),
                            ),
                        }));
                    }}
                    onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        drag.current = {
                            x: e.clientX,
                            y: e.clientY,
                            left: position.x,
                            top: position.y,
                        };
                    }}
                    onPointerMove={(e) => {
                        const d = drag.current;
                        if (!d) return;
                        setPosition({
                            x: Math.max(
                                8,
                                Math.min(
                                    innerWidth - (bar.current?.offsetWidth ?? 320) - 8,
                                    d.left + e.clientX - d.x,
                                ),
                            ),
                            y: Math.max(
                                8,
                                Math.min(
                                    innerHeight - (bar.current?.offsetHeight ?? 44) - 8,
                                    d.top + e.clientY - d.y,
                                ),
                            ),
                        });
                    }}
                    onPointerUp={() => {
                        drag.current = null;
                    }}
                    onPointerCancel={() => {
                        drag.current = null;
                    }}
                    onLostPointerCapture={() => {
                        drag.current = null;
                    }}
                >
                    <GripVertical size={16} />
                </button>
                <strong className="genie-edit-title" role="status">
                    {busy || (pasting ? '넣을 위치 클릭' : active ? '지니 선택모드' : '지니')}
                </strong>
                {controls}
                {copiedButton}
                <button
                    type="button"
                    className="genie-edit-icon"
                    aria-label="패널 열기"
                    title="패널 열기"
                    onClick={() => setCompact(false)}
                >
                    <PanelRightOpen size={16} />
                </button>
            </div>
            {details}
            {(notice || (active && props.notice)) && (
                <div
                    className={`genie-edit-toast${notice?.kind === 'error' ? ' genie-edit-toast--error' : ''}`}
                    role={notice?.kind === 'error' ? 'alert' : 'status'}
                >
                    <span>{notice?.message || props.notice}</span>
                    {notice && (
                        <button
                            type="button"
                            className="genie-edit-icon"
                            aria-label="알림 닫기"
                            onClick={() => presentation?.clearNotice()}
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
    return root ? createPortal(content, root) : content;
}
