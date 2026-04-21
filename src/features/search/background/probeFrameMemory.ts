import { readFrameMemory } from './readFrameMemory';

/**
 * probeFrameMemory 결과 리포트.
 * - exists: 해당 경로에서 값이 존재하며 null/undefined가 아님
 * - reachedPath: 실제로 도달한 지점까지의 경로 (중간에 undefined면 거기까지만)
 * - typeofValue: typeof 결과
 * - constructorName: 생성자 이름 (객체/클래스 인스턴스 식별용)
 * - ownKeys: Object.getOwnPropertyNames 결과 (최대 100개)
 * - prototypeKeys: 프로토타입 체인의 메서드/프로퍼티 (최대 100개)
 * - methods: 프로토타입 포함 function 타입 프로퍼티 이름 (getDom 등 탐색용)
 * - keyTypes: ownKeys 각각의 간단한 타입 표기
 * - sample: 배열이면 첫 요소의 shape 미리보기
 */
export interface ProbeReport {
    path: string;
    exists: boolean;
    reachedPath: string;
    typeofValue: string;
    constructorName: string | null;
    ownKeys: string[];
    prototypeKeys: string[];
    methods: string[];
    keyTypes: Record<string, string>;
    sample: unknown;
    error?: string;
}

/**
 * 대상 프레임의 MAIN world에서 window.<dotted.path>를 탐색하고 shape 리포트를 반환.
 * 실제 값을 그대로 돌려주진 않고(구조화 클론 대상 제약 + 보안) 메타데이터만 요약.
 *
 * 사용 예:
 *   const r = await probeFrameMemory(tabId, frameId, 'myApp.screen.events')
 *   console.log(r?.methods)  // ['getDom', 'getById', ...]
 */
export async function probeFrameMemory(
    tabId: number,
    frameId: number,
    path: string,
): Promise<ProbeReport | null> {
    return readFrameMemory(
        tabId,
        frameId,
        (dottedPath: string): ProbeReport => {
            const MAX_KEYS = 100;
            const segments = dottedPath.split('.').filter(Boolean);

            const report: ProbeReport = {
                path: dottedPath,
                exists: false,
                reachedPath: 'window',
                typeofValue: 'undefined',
                constructorName: null,
                ownKeys: [],
                prototypeKeys: [],
                methods: [],
                keyTypes: {},
                sample: null,
            };

            // dotted path 순회: 중간에 getter throw가 나면 그 지점까지 기록
            let cursor: unknown = window;
            for (const seg of segments) {
                if (cursor === null || cursor === undefined) {
                    report.error = `path stopped at "${report.reachedPath}" (null/undefined)`;
                    return report;
                }
                try {
                    cursor = (cursor as Record<string, unknown>)[seg];
                    report.reachedPath += `.${seg}`;
                } catch (e) {
                    report.error = `getter threw at "${report.reachedPath}.${seg}": ${
                        (e as Error)?.message ?? String(e)
                    }`;
                    return report;
                }
            }

            if (cursor === null || cursor === undefined) {
                report.typeofValue = cursor === null ? 'null' : 'undefined';
                return report;
            }

            report.exists = true;
            report.typeofValue = typeof cursor;

            // 프리미티브면 여기까지
            if (typeof cursor !== 'object' && typeof cursor !== 'function') {
                return report;
            }

            // 생성자 이름
            try {
                report.constructorName =
                    (cursor as { constructor?: { name?: string } })?.constructor?.name ?? null;
            } catch {
                report.constructorName = null;
            }

            // own keys + 타입
            try {
                const keys = Object.getOwnPropertyNames(cursor as object).slice(0, MAX_KEYS);
                report.ownKeys = keys;
                for (const k of keys) {
                    try {
                        const v = (cursor as Record<string, unknown>)[k];
                        if (v === null) report.keyTypes[k] = 'null';
                        else if (Array.isArray(v))
                            report.keyTypes[k] = `Array(${v.length})`;
                        else if (typeof v === 'function') report.keyTypes[k] = 'function';
                        else if (typeof v === 'object') {
                            const cn =
                                (v as { constructor?: { name?: string } })?.constructor?.name ??
                                'object';
                            report.keyTypes[k] = cn;
                        } else {
                            report.keyTypes[k] = typeof v;
                        }
                    } catch {
                        report.keyTypes[k] = '<getter threw>';
                    }
                }
            } catch {
                // ignore
            }

            // prototype 체인(한 단계)의 이름들 — 메서드 탐색용
            try {
                const proto = Object.getPrototypeOf(cursor);
                if (proto && proto !== Object.prototype) {
                    report.prototypeKeys = Object.getOwnPropertyNames(proto).slice(0, MAX_KEYS);
                }
            } catch {
                // ignore
            }

            // methods = own + prototype 중 function 타입
            const methodSet = new Set<string>();
            for (const k of [...report.ownKeys, ...report.prototypeKeys]) {
                try {
                    const v = (cursor as Record<string, unknown>)[k];
                    if (typeof v === 'function') methodSet.add(k);
                } catch {
                    // ignore
                }
            }
            report.methods = [...methodSet];

            // 배열이면 첫 요소 shape 살짝만
            if (Array.isArray(cursor) && cursor.length > 0) {
                const first = cursor[0];
                if (first && typeof first === 'object') {
                    try {
                        const firstKeys = Object.getOwnPropertyNames(first).slice(0, 30);
                        const shape: Record<string, string> = {};
                        for (const k of firstKeys) {
                            try {
                                const v = (first as Record<string, unknown>)[k];
                                shape[k] =
                                    v === null
                                        ? 'null'
                                        : Array.isArray(v)
                                          ? `Array(${v.length})`
                                          : typeof v;
                            } catch {
                                shape[k] = '<getter threw>';
                            }
                        }
                        report.sample = { length: cursor.length, firstShape: shape };
                    } catch {
                        report.sample = { length: cursor.length };
                    }
                } else {
                    report.sample = { length: cursor.length, firstType: typeof first };
                }
            }

            return report;
        },
        [path],
    );
}
