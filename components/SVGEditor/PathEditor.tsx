/**
 * PathEditor — renders draggable node handles in the SVG canvas for path editing.
 * Sits inside the viewport transform div, parallel to BoundingBox.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSVGEditorStore } from '../../stores/svgEditorStore';
import { useTranslation } from '../../hooks/useTranslation';
import {
    parsePathToNodes,
    parsePolygonToNodes,
    parseLineToNodes,
    serializeNodesToPath,
    serializeNodesToPolygon,
    serializeNodesToLine,
    insertNodeAtSegment,
    deleteNode,
    type ParsedNode,
    type Point,
} from '../../utils/pathParser';

interface PathEditorProps {
    svgElement: SVGSVGElement;
    elementId: string;
}

// ── Node rendering constants ─────────────────────────────────────────────────

const ANCHOR_SIZE = 14;
const SMOOTH_SIZE = 12;
const HANDLE_SIZE = 9;

const ANCHOR_COLOR = '#ffffff';           // white — visible on any shape color
const ANCHOR_STROKE = '#4f46e5';          // indigo-600
const ANCHOR_SELECTED_FILL = '#fbbf24';   // amber-400
const ANCHOR_SELECTED_STROKE = '#d97706'; // amber-600
const HANDLE_COLOR = '#e2e8f0';           // slate-200
const HANDLE_STROKE = '#64748b';          // slate-500
const HANDLE_LINE_COLOR = '#6366f1';      // indigo-400
const DELETE_RING_COLOR = '#ef4444';      // red-500

// ── Helpers ──────────────────────────────────────────────────────────────────

function getElementData(svgDocument: string, elementId: string): { tag: string; d?: string; points?: string; x1?: number; y1?: number; x2?: number; y2?: number } | null {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgDocument, 'image/svg+xml');
    const el = doc.getElementById(elementId);
    if (!el) return null;
    const tag = el.tagName.toLowerCase();
    return {
        tag,
        d: el.getAttribute('d') ?? undefined,
        points: el.getAttribute('points') ?? undefined,
        x1: parseFloat(el.getAttribute('x1') || '0'),
        y1: parseFloat(el.getAttribute('y1') || '0'),
        x2: parseFloat(el.getAttribute('x2') || '0'),
        y2: parseFloat(el.getAttribute('y2') || '0'),
    };
}

export default function PathEditor({ svgElement, elementId }: PathEditorProps) {
    const { t } = useTranslation();
    const svgDocument = useSVGEditorStore(state => state.svgDocument);
    const updatePathData = useSVGEditorStore(state => state.updatePathData);
    const selectedNodeIndex = useSVGEditorStore(state => state.selectedNodeIndex);
    const setSelectedNodeIndex = useSVGEditorStore(state => state.setSelectedNodeIndex);
    const pathEditMode = useSVGEditorStore(state => state.pathEditMode);
    const pathEditTool = useSVGEditorStore(state => state.pathEditTool);
    const zoom = useSVGEditorStore(state => state.viewport.zoom);

    const [nodes, setNodes] = useState<ParsedNode[]>([]);
    const [selectedNodeIndices, setSelectedNodeIndices] = useState<Set<number>>(new Set());
    const [hoverNodeIndex, setHoverNodeIndex] = useState<number | null>(null);
    const [dragState, setDragState] = useState<{
        type: 'anchor' | 'cp1' | 'cp2';
        nodeIndex: number;
        startMouse: Point;
        startPoint: Point;
        startCp1?: Point;
        startCp2?: Point;
    } | null>(null);
    const [marquee, setMarquee] = useState<{
        startX: number; startY: number;
        currentX: number; currentY: number;
    } | null>(null);

    const overlayRef = useRef<SVGSVGElement>(null);

    // Parse nodes from the current SVG document
    useEffect(() => {
        if (!svgDocument) { setNodes([]); return; }
        const data = getElementData(svgDocument, elementId);
        if (!data) { setNodes([]); return; }

        if (data.tag === 'path' && data.d) {
            setNodes(parsePathToNodes(data.d));
        } else if ((data.tag === 'polygon' || data.tag === 'polyline') && data.points) {
            setNodes(parsePolygonToNodes(data.points));
        } else if (data.tag === 'line') {
            setNodes(parseLineToNodes(data.x1!, data.y1!, data.x2!, data.y2!));
        } else {
            setNodes([]);
        }
    }, [svgDocument, elementId]);

    // ── Coordinate transforms ────────────────────────────────────────────────

    // Get the element's CTM (element-local → SVG viewport)
    const getElementCTM = useCallback((): DOMMatrix | null => {
        const el = svgElement.getElementById(elementId);
        if (!el) return null;
        return (el as SVGGraphicsElement).getCTM?.() ?? null;
    }, [svgElement, elementId]);

    // Compute CTM for SVG-local → screen coordinates
    const getCTM = useCallback(() => {
        const el = svgElement.getElementById(elementId);
        if (!el) return svgElement.getScreenCTM();
        return (el as SVGGraphicsElement).getScreenCTM?.() ?? svgElement.getScreenCTM();
    }, [svgElement, elementId]);

    // Convert screen coords to SVG-local coords (element coordinate space)
    const screenToSvg = useCallback((screenX: number, screenY: number): Point => {
        const ctm = getCTM();
        if (!ctm) return { x: screenX, y: screenY };
        const inv = ctm.inverse();
        return {
            x: inv.a * screenX + inv.c * screenY + inv.e,
            y: inv.b * screenX + inv.d * screenY + inv.f,
        };
    }, [getCTM]);

    // Convert element-local coords to overlay coords (SVG viewBox space)
    // The overlay SVG matches the root <svg> viewBox, so we need to transform
    // from element-local coordinates to root SVG coordinates using the element's CTM.
    const svgToOverlay = useCallback((pt: Point): Point => {
        const ctm = getElementCTM();
        if (!ctm) return pt;
        return {
            x: ctm.a * pt.x + ctm.c * pt.y + ctm.e,
            y: ctm.b * pt.x + ctm.d * pt.y + ctm.f,
        };
    }, [getElementCTM]);

    // Commit changed nodes back to the store
    const commitNodes = useCallback((updatedNodes: ParsedNode[]) => {
        if (!pathEditMode) return;
        const tag = pathEditMode.elementType;
        if (tag === 'path') {
            updatePathData(elementId, serializeNodesToPath(updatedNodes));
        } else if (tag === 'polygon' || tag === 'polyline') {
            updatePathData(elementId, serializeNodesToPolygon(updatedNodes));
        } else if (tag === 'line') {
            updatePathData(elementId, serializeNodesToLine(updatedNodes));
        }
    }, [pathEditMode, elementId, updatePathData]);

    // ── Tool-mode actions ─────────────────────────────────────────────────────

    const handleDeleteNode = useCallback((nodeIndex: number) => {
        setNodes(prev => {
            const updated = deleteNode(prev, nodeIndex);
            commitNodes(updated);
            return updated;
        });
        setSelectedNodeIndex(null);
        setSelectedNodeIndices(new Set());
    }, [commitNodes, setSelectedNodeIndex]);

    const handleAddNodeOnSegment = useCallback((segmentIndex: number) => {
        setNodes(prev => {
            const updated = insertNodeAtSegment(prev, segmentIndex, 0.5);
            commitNodes(updated);
            return updated;
        });
    }, [commitNodes]);

    // ── Drag handlers ────────────────────────────────────────────────────────

    const handleMouseDown = useCallback((
        e: React.MouseEvent,
        nodeIndex: number,
        type: 'anchor' | 'cp1' | 'cp2',
    ) => {
        e.stopPropagation();
        e.preventDefault();

        const node = nodes[nodeIndex];
        if (!node) return;
        if (node.kind === 'anchor-close') return; // Z not draggable

        // Delete tool: click to delete node
        if (pathEditTool === 'delete' && type === 'anchor') {
            handleDeleteNode(nodeIndex);
            return;
        }

        // Multi-select with shift
        if (e.shiftKey && type === 'anchor') {
            setSelectedNodeIndices(prev => {
                const next = new Set(prev);
                if (next.has(nodeIndex)) next.delete(nodeIndex);
                else next.add(nodeIndex);
                return next;
            });
            setSelectedNodeIndex(nodeIndex);
            return;
        }

        setSelectedNodeIndex(nodeIndex);
        if (!e.shiftKey) {
            setSelectedNodeIndices(new Set([nodeIndex]));
        }

        // Only drag in select mode
        if (pathEditTool !== 'select') return;

        const startPoint = type === 'anchor' ? node.anchor
            : type === 'cp1' ? (node.cp1 ?? node.anchor)
            : (node.cp2 ?? node.anchor);

        setDragState({
            type,
            nodeIndex,
            startMouse: { x: e.clientX, y: e.clientY },
            startPoint: { ...startPoint },
            startCp1: node.cp1 ? { ...node.cp1 } : undefined,
            startCp2: node.cp2 ? { ...node.cp2 } : undefined,
        });
    }, [nodes, setSelectedNodeIndex, pathEditTool, handleDeleteNode]);

    useEffect(() => {
        if (!dragState) return;

        const handleMouseMove = (e: MouseEvent) => {
            const ctm = getCTM();
            if (!ctm) return;

            const startSvg = screenToSvg(dragState.startMouse.x, dragState.startMouse.y);
            const currentSvg = screenToSvg(e.clientX, e.clientY);
            const dx = currentSvg.x - startSvg.x;
            const dy = currentSvg.y - startSvg.y;

            setNodes(prev => {
                const updated = [...prev];
                const node = { ...updated[dragState.nodeIndex] };

                if (dragState.type === 'anchor') {
                    // Move anchor + handles solidarily
                    node.anchor = {
                        x: dragState.startPoint.x + dx,
                        y: dragState.startPoint.y + dy,
                    };
                    if (dragState.startCp1) {
                        node.cp1 = {
                            x: dragState.startCp1.x + dx,
                            y: dragState.startCp1.y + dy,
                        };
                    }
                    if (dragState.startCp2) {
                        node.cp2 = {
                            x: dragState.startCp2.x + dx,
                            y: dragState.startCp2.y + dy,
                        };
                    }
                } else if (dragState.type === 'cp1' && node.cp1) {
                    node.cp1 = {
                        x: dragState.startPoint.x + dx,
                        y: dragState.startPoint.y + dy,
                    };
                    // Smooth: reflect opposite handle
                    if (node.kind === 'anchor-smooth' && node.cp2) {
                        const d1 = Math.sqrt(
                            (node.cp1.x - node.anchor.x) ** 2 +
                            (node.cp1.y - node.anchor.y) ** 2
                        );
                        const origD2 = dragState.startCp2
                            ? Math.sqrt(
                                (dragState.startCp2.x - dragState.startPoint.x) ** 2 +
                                (dragState.startCp2.y - dragState.startPoint.y) ** 2
                              )
                            : d1;
                        if (d1 > 1e-6) {
                            const ux = (node.cp1.x - node.anchor.x) / d1;
                            const uy = (node.cp1.y - node.anchor.y) / d1;
                            node.cp2 = {
                                x: node.anchor.x - ux * origD2,
                                y: node.anchor.y - uy * origD2,
                            };
                        }
                    }
                } else if (dragState.type === 'cp2' && node.cp2) {
                    node.cp2 = {
                        x: dragState.startPoint.x + dx,
                        y: dragState.startPoint.y + dy,
                    };
                    // Smooth: reflect opposite handle
                    if (node.kind === 'anchor-smooth' && node.cp1) {
                        const d2 = Math.sqrt(
                            (node.cp2.x - node.anchor.x) ** 2 +
                            (node.cp2.y - node.anchor.y) ** 2
                        );
                        const origD1 = dragState.startCp1
                            ? Math.sqrt(
                                (dragState.startCp1.x - dragState.startPoint.x) ** 2 +
                                (dragState.startCp1.y - dragState.startPoint.y) ** 2
                              )
                            : d2;
                        if (d2 > 1e-6) {
                            const ux = (node.cp2.x - node.anchor.x) / d2;
                            const uy = (node.cp2.y - node.anchor.y) / d2;
                            node.cp1 = {
                                x: node.anchor.x - ux * origD1,
                                y: node.anchor.y - uy * origD1,
                            };
                        }
                    }
                }

                updated[dragState.nodeIndex] = node;
                return updated;
            });
        };

        const handleMouseUp = () => {
            // Commit to store
            setNodes(current => {
                commitNodes(current);
                return current;
            });
            setDragState(null);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragState, getCTM, screenToSvg, commitNodes]);

    // ── Marquee selection ─────────────────────────────────────────────────────

    const handleOverlayMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.target !== overlayRef.current) return;
        if (pathEditTool !== 'select') return;

        // Start marquee
        const svg = overlayRef.current!;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const ctm = svg.getScreenCTM();
        if (!ctm) return;
        const svgPt = pt.matrixTransform(ctm.inverse());

        setMarquee({
            startX: svgPt.x, startY: svgPt.y,
            currentX: svgPt.x, currentY: svgPt.y,
        });
    }, [pathEditTool]);

    useEffect(() => {
        if (!marquee) return;

        const handleMove = (e: MouseEvent) => {
            const svg = overlayRef.current;
            if (!svg) return;
            const pt = svg.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const ctm = svg.getScreenCTM();
            if (!ctm) return;
            const svgPt = pt.matrixTransform(ctm.inverse());
            setMarquee(prev => prev ? { ...prev, currentX: svgPt.x, currentY: svgPt.y } : null);
        };

        const handleUp = () => {
            if (marquee) {
                const x1 = Math.min(marquee.startX, marquee.currentX);
                const y1 = Math.min(marquee.startY, marquee.currentY);
                const x2 = Math.max(marquee.startX, marquee.currentX);
                const y2 = Math.max(marquee.startY, marquee.currentY);

                const selected = new Set<number>();
                nodes.forEach(node => {
                    const o = svgToOverlay(node.anchor);
                    if (o.x >= x1 && o.x <= x2 && o.y >= y1 && o.y <= y2) {
                        selected.add(node.index);
                    }
                });
                setSelectedNodeIndices(selected);
                if (selected.size === 1) {
                    setSelectedNodeIndex(selected.values().next().value!);
                } else {
                    setSelectedNodeIndex(null);
                }
            }
            setMarquee(null);
        };

        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleUp);
        return () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleUp);
        };
    }, [marquee, nodes, svgToOverlay, setSelectedNodeIndex]);

    // Click on empty space inside PathEditor deselects node but stays in mode
    const handleOverlayClick = useCallback((e: React.MouseEvent) => {
        if (e.target === overlayRef.current) {
            setSelectedNodeIndex(null);
            setSelectedNodeIndices(new Set());
        }
    }, [setSelectedNodeIndex]);

    // ── Add-mode: click on segment line to insert node ────────────────────────

    const handleSegmentClick = useCallback((e: React.MouseEvent, segmentIndex: number) => {
        if (pathEditTool !== 'add') return;
        e.stopPropagation();
        e.preventDefault();
        handleAddNodeOnSegment(segmentIndex);
    }, [pathEditTool, handleAddNodeOnSegment]);

    // Get the viewBox from the SVG element
    const viewBox = useMemo(() => {
        const vb = svgElement.getAttribute('viewBox');
        if (vb) return vb;
        const w = svgElement.clientWidth || 100;
        const h = svgElement.clientHeight || 100;
        return `0 0 ${w} ${h}`;
    }, [svgElement]);

    const svgWidth = svgElement.clientWidth || 100;
    const svgHeight = svgElement.clientHeight || 100;

    // Compute inverse scale: viewBox units → screen pixels = (svgWidth / vbWidth) * zoom
    // To keep handles at constant screen size, multiply sizes by this factor.
    const vbParts = viewBox.split(/\s+/).map(Number);
    const vbWidth = vbParts[2] || svgWidth;
    const viewBoxToScreenScale = (svgWidth / vbWidth) * zoom;
    const iz = 1 / viewBoxToScreenScale; // inverse: screen px → viewBox units

    // Sizes in viewBox units that yield constant screen-pixel appearance
    const anchorR = (ANCHOR_SIZE / 2) * iz;
    const smoothR = (SMOOTH_SIZE / 2) * iz;
    const handleR = (HANDLE_SIZE / 2) * iz;
    const strokeW = 1.5 * iz;
    const strokeWThin = iz;
    const strokeWThick = 3 * iz;
    const dashArray = `${3 * iz} ${2 * iz}`;
    const segHitWidth = 12 * iz;

    // Tool-specific cursor
    const toolCursor = pathEditTool === 'add' ? 'copy'
        : pathEditTool === 'delete' ? 'not-allowed'
        : 'default';

    if (nodes.length === 0) {
        return (
            <div
                className="absolute inset-0 z-20 flex items-center justify-center text-sm text-slate-400"
                style={{ width: svgWidth, height: svgHeight }}
            >
                {t('svgEditor.notEditableShape')}
            </div>
        );
    }

    // ── Render segment lines (for add-mode click targets) ─────────────────────

    const renderSegments = () => {
        if (pathEditTool !== 'add') return null;
        const segments: React.ReactNode[] = [];
        for (let i = 1; i < nodes.length; i++) {
            const prev = nodes[i - 1];
            const curr = nodes[i];
            if (curr.kind === 'anchor-close') continue;
            const p1 = svgToOverlay(prev.anchor);
            const p2 = svgToOverlay(curr.anchor);
            segments.push(
                <line
                    key={`seg-${i}`}
                    x1={p1.x} y1={p1.y}
                    x2={p2.x} y2={p2.y}
                    stroke="transparent"
                    strokeWidth={segHitWidth}
                    style={{ cursor: 'copy' }}
                    onClick={(e) => handleSegmentClick(e, i)}
                />
            );
        }
        return segments;
    };

    // ── Render node shapes ───────────────────────────────────────────────────

    const renderAnchor = (node: ParsedNode) => {
        const { anchor, kind, index } = node;
        const isSelected = selectedNodeIndex === index || selectedNodeIndices.has(index);
        const isDeleteTarget = pathEditTool === 'delete' && hoverNodeIndex === index;
        const fillColor = isSelected ? ANCHOR_SELECTED_FILL : ANCHOR_COLOR;
        const strokeColor = isDeleteTarget ? DELETE_RING_COLOR
            : isSelected ? ANCHOR_SELECTED_STROKE : ANCHOR_STROKE;
        const o = svgToOverlay(anchor);

        const hoverProps = {
            onMouseEnter: () => setHoverNodeIndex(index),
            onMouseLeave: () => setHoverNodeIndex(null),
        };

        if (kind === 'anchor-close') {
            // Hollow circle — not draggable
            return (
                <circle
                    key={`anchor-${index}`}
                    cx={o.x} cy={o.y} r={handleR}
                    fill="rgba(255,255,255,0.6)"
                    stroke={isSelected ? ANCHOR_SELECTED_STROKE : ANCHOR_STROKE}
                    strokeWidth={2 * iz}
                    style={{ cursor: 'default' }}
                />
            );
        }

        const anchorCursor = pathEditTool === 'delete' ? 'not-allowed'
            : pathEditTool === 'add' ? 'copy'
            : 'crosshair';

        const commonProps = {
            onMouseDown: (e: React.MouseEvent) => handleMouseDown(e, index, 'anchor'),
            style: { cursor: anchorCursor as string },
            ...hoverProps,
        };

        if (kind === 'anchor-corner') {
            // Diamond
            const points = `${o.x},${o.y - anchorR} ${o.x + anchorR},${o.y} ${o.x},${o.y + anchorR} ${o.x - anchorR},${o.y}`;
            return (
                <polygon
                    key={`anchor-${index}`}
                    points={points}
                    fill={fillColor} stroke={strokeColor}
                    strokeWidth={isDeleteTarget ? strokeWThick : strokeW}
                    {...commonProps}
                />
            );
        }

        if (kind === 'anchor-smooth') {
            // Circle
            return (
                <circle
                    key={`anchor-${index}`}
                    cx={o.x} cy={o.y} r={smoothR}
                    fill={fillColor} stroke={strokeColor}
                    strokeWidth={isDeleteTarget ? strokeWThick : strokeW}
                    {...commonProps}
                />
            );
        }

        // anchor-asymm — Square
        return (
            <rect
                key={`anchor-${index}`}
                x={o.x - smoothR} y={o.y - smoothR} width={smoothR * 2} height={smoothR * 2}
                fill={fillColor} stroke={strokeColor}
                strokeWidth={isDeleteTarget ? strokeWThick : strokeW}
                {...commonProps}
            />
        );
    };

    const renderHandle = (node: ParsedNode, type: 'cp1' | 'cp2') => {
        const cp = type === 'cp1' ? node.cp1 : node.cp2;
        if (!cp) return null;
        if (node.command === 'A') return null; // Arc params are not draggable handles

        const o = svgToOverlay(cp);
        const anchorO = svgToOverlay(node.anchor);

        return (
            <React.Fragment key={`handle-${node.index}-${type}`}>
                {/* Dashed line from anchor to handle */}
                <line
                    x1={anchorO.x} y1={anchorO.y}
                    x2={o.x} y2={o.y}
                    stroke={HANDLE_LINE_COLOR}
                    strokeWidth={strokeWThin}
                    strokeDasharray={dashArray}
                    pointerEvents="none"
                />
                {/* Handle circle */}
                <circle
                    cx={o.x} cy={o.y} r={handleR}
                    fill={HANDLE_COLOR} stroke={HANDLE_STROKE} strokeWidth={strokeWThin}
                    style={{ cursor: pathEditTool === 'select' ? 'move' : toolCursor }}
                    onMouseDown={(e) => handleMouseDown(e, node.index, type)}
                />
            </React.Fragment>
        );
    };

    // Marquee rect
    const marqueeRect = marquee ? {
        x: Math.min(marquee.startX, marquee.currentX),
        y: Math.min(marquee.startY, marquee.currentY),
        width: Math.abs(marquee.currentX - marquee.startX),
        height: Math.abs(marquee.currentY - marquee.startY),
    } : null;

    return (
        <svg
            ref={overlayRef}
            viewBox={viewBox}
            overflow="visible"
            className="absolute inset-0 z-20 pointer-events-auto"
            style={{ width: svgWidth, height: svgHeight, cursor: toolCursor, overflow: 'visible' }}
            onClick={handleOverlayClick}
            onMouseDown={handleOverlayMouseDown}
        >
            {/* Segment click targets for add mode */}
            {renderSegments()}
            {/* Render handle lines and circles first (below anchors) */}
            {nodes.map(node => (
                <React.Fragment key={`handles-${node.index}`}>
                    {renderHandle(node, 'cp1')}
                    {renderHandle(node, 'cp2')}
                </React.Fragment>
            ))}
            {/* Render anchors on top */}
            {nodes.map(renderAnchor)}
            {/* Marquee selection rect */}
            {marqueeRect && (
                <rect
                    x={marqueeRect.x} y={marqueeRect.y}
                    width={marqueeRect.width} height={marqueeRect.height}
                    fill="rgba(99,102,241,0.1)"
                    stroke="#6366f1"
                    strokeWidth={strokeWThin}
                    strokeDasharray={`${4 * iz} ${2 * iz}`}
                    pointerEvents="none"
                />
            )}
        </svg>
    );
}
