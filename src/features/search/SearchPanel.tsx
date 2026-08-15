import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { KIND_ICON } from '../../shared/icons';
import type { NotifyPanel } from '../../shared/panelNotice';
import type { SearchMatch, SearchMatchField } from '../../shared/types/messages';
import { useSearchPanel, type FilterKey } from './useSearchPanel';

const FILTER_LABELS: Record<FilterKey, string> = {
    event: '이벤트',
    transaction: '트랜잭션',
    condition: '조건',
    variable: '변수',
};

const MATCH_FIELD_LABEL: Record<SearchMatchField, string> = {
    varPrefix: '로직 prefix',
    displayText: '로직 이름',
    eventId: '이벤트 ID',
    eventInputParamId: '이벤트 입력 파라미터 ID',
    eventInputParamEid: '이벤트 입력 바인딩',
    transactionId: '트랜잭션 ID',
    transactionInputParamId: '트랜잭션 입력 파라미터 ID',
    transactionOutParamId: '트랜잭션 출력 파라미터 ID',
    transactionInputParamSetParamId: '트랜잭션 입력 바인딩',
    variableId: '변수 ID',
    variableSetParamId: '변수 바인딩',
    conditionCondParamId: '조건 대상 ID',
    conditionCondParamValue: '조건 대상 값',
    conditionSetParamId: '조건 비교 ID',
    conditionSetParamValue: '조건 비교 값',
};

function buildMatchTooltip(match: SearchMatch): string {
    const label = MATCH_FIELD_LABEL[match.matchedField];
    if (!match.matchedValue) return label;
    return `${label}: ${match.matchedValue}`;
}

function renderSnippet(match: SearchMatch) {
    const { snippet, matchStart, matchEnd } = match;
    if (matchStart < 0 || matchEnd <= matchStart) {
        return <>{snippet}</>;
    }
    const before = snippet.slice(0, matchStart);
    const hit = snippet.slice(matchStart, matchEnd);
    const after = snippet.slice(matchEnd);
    return (
        <>
            {before}
            <strong>{hit}</strong>
            {after}
        </>
    );
}

interface SearchPanelProps {
    focusSignal?: number;
    notify: NotifyPanel;
    clearNotice: () => void;
    clearGuide: () => void;
}

export function SearchPanel(props: SearchPanelProps) {
    const {
        inputRef,
        query,
        matches,
        currentIndex,
        searched,
        isSearching,
        filters,
        handleSearch,
        handleClear,
        handleQueryChange,
        handleKeyDown,
        handlePrev,
        handleNext,
        handleResultClick,
        toggleFilter,
    } = useSearchPanel(props);

    return (
        <div className="panel">
            <div className="panel__search-wrap">
                <input
                    ref={inputRef}
                    className="panel__input"
                    type="text"
                    placeholder="검색어를 입력하세요"
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                {query && (
                    <button
                        className="panel__input-clear"
                        onClick={handleClear}
                        aria-label="초기화"
                    >
                        <X size={13} />
                    </button>
                )}
                <button
                    className="panel__input-search"
                    onClick={handleSearch}
                    aria-label="검색"
                    disabled={isSearching}
                >
                    <Search size={15} aria-hidden="true" />
                </button>
            </div>

            <div className="panel__filters">
                {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
                    <button
                        key={key}
                        onClick={() => toggleFilter(key)}
                        className={`panel__filter-btn ${filters[key] ? 'panel__filter-btn--active' : ''}`}
                    >
                        {FILTER_LABELS[key]}
                    </button>
                ))}
            </div>

            {matches.length > 0 && (
                <div className="panel__results">
                    <div className="panel__results-header">
                        <span>
                            {currentIndex + 1} / {matches.length}
                        </span>
                        <div className="panel__results-nav">
                            <button
                                className="panel__results-nav-btn"
                                onClick={handlePrev}
                                aria-label="이전 결과"
                            >
                                <ChevronUp size={14} />
                            </button>
                            <button
                                className="panel__results-nav-btn"
                                onClick={handleNext}
                                aria-label="다음 결과"
                            >
                                <ChevronDown size={14} />
                            </button>
                        </div>
                    </div>
                    <ul className="panel__results-list">
                        {matches.map((match, index) => {
                            const Icon = KIND_ICON[match.kind];
                            return (
                                <li
                                    key={match.id}
                                    className={`panel__result-item ${index === currentIndex ? 'panel__result-item--active' : ''}`}
                                    role="button"
                                    tabIndex={0}
                                    aria-current={index === currentIndex ? 'true' : undefined}
                                    onClick={() => handleResultClick(index)}
                                    onKeyDown={(e) => {
                                        if (e.key !== 'Enter' && e.key !== ' ') return;
                                        e.preventDefault();
                                        handleResultClick(index);
                                    }}
                                    title={buildMatchTooltip(match)}
                                >
                                    <span className="panel__result-seq">
                                        {match.seq || '-'}
                                    </span>
                                    <Icon
                                        className="panel__result-icon"
                                        aria-label={FILTER_LABELS[match.kind]}
                                    />
                                    <span className="panel__result-text">
                                        {renderSnippet(match)}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {isSearching && <p className="panel__hint">검색 중...</p>}

            {!isSearching && searched && matches.length === 0 && (
                <p className="panel__hint panel__hint--error">검색 결과가 없습니다.</p>
            )}

            {!searched && !isSearching && (
                <p className="panel__hint">검색어를 입력하고 Enter를 누르세요</p>
            )}
        </div>
    );
}
