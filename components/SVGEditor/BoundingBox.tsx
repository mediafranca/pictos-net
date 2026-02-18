/**
 * Bounding Box Component
 * Implements Move and Scale operations with correct SVG coordinate transformation
 */

import { useEffect, useState, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useSVGEditorStore } from '../../stores/svgEditorStore';

interface BoundingBoxProps {
    svgElement: SVGSVGElement;
    elementId: string;
    containerElement: Element;
    onTransformComplete?: () => void;
}

interface BBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

type HandleType = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | 'rotate';

const NUMBER_REGEX = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const EPSILON = 1e-6;

function parseNumbers(input: string): number[] {
    const matches = input.match(NUMBER_REGEX);
    return matches ? matches.map((value) => Number(value)) : [];
}

function formatNumber(value: number): string {
    if (!Number.isFinite(value)) return '0';
    const rounded = Math.round(value * 1000) / 1000;
    const normalized = Object.is(rounded, -0) ? 0 : rounded;
    return `${normalized}`;
}

function formatNumberList(values: number[]): string {
    return values.map(formatNumber).join(' ');
}

// Helper: transformPathData
function transformPathData(
    d: string,
    mapX: (x: number) => number,
    mapY: (y: number) => number,
    scaleX: number,
    scaleY: number
): string {
    const commandRegex = /([a-zA-Z])([^a-zA-Z]*)/g;
    const paramCounts: Record<string, number> = {
        M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
    };

    const parts: string[] = [];
    let match: RegExpExecArray | null;
    let currentX = 0;
    let currentY = 0;
    let startX = 0; // For Z command
    let startY = 0; // For Z command

    while ((match = commandRegex.exec(d)) !== null) {
        const command = match[1];
        const upper = command.toUpperCase();
        const params = parseNumbers(match[2] ?? '');
        const isRelative = command === command.toLowerCase();

        if (upper === 'Z') {
            parts.push('Z');
            currentX = startX;
            currentY = startY;
            continue;
        }

        const paramCount = paramCounts[upper];
        if (!paramCount || params.length === 0) continue;

        const pushMapped = (cmd: string, values: number[]) => {
            parts.push(`${cmd}${formatNumberList(values)}`);
        };

        let index = 0;

        // Initial Move command
        if (upper === 'M') {
            while (index + 1 < params.length) {
                let x = params[index];
                let y = params[index + 1];
                if (isRelative) { x += currentX; y += currentY; }

                if (index === 0) {
                    startX = x;
                    startY = y;
                    pushMapped('M', [mapX(x), mapY(y)]);
                } else {
                    pushMapped('L', [mapX(x), mapY(y)]);
                }
                currentX = x;
                currentY = y;
                index += 2;
            }
            continue;
        }

        while (index + paramCount - 1 < params.length) {
            const chunk = params.slice(index, index + paramCount);

            switch (upper) {
                case 'L': {
                    let x = chunk[0];
                    let y = chunk[1];
                    if (isRelative) { x += currentX; y += currentY; }
                    pushMapped('L', [mapX(x), mapY(y)]);
                    currentX = x; currentY = y;
                    break;
                }
                case 'H': {
                    let x = chunk[0];
                    if (isRelative) { x += currentX; }
                    pushMapped('L', [mapX(x), mapY(currentY)]);
                    currentX = x;
                    break;
                }
                case 'V': {
                    let y = chunk[0];
                    if (isRelative) { y += currentY; }
                    pushMapped('L', [mapX(currentX), mapY(y)]);
                    currentY = y;
                    break;
                }
                case 'C': {
                    let [x1, y1, x2, y2, x, y] = chunk;
                    if (isRelative) {
                        x1 += currentX; y1 += currentY;
                        x2 += currentX; y2 += currentY;
                        x += currentX; y += currentY;
                    }
                    pushMapped('C', [mapX(x1), mapY(y1), mapX(x2), mapY(y2), mapX(x), mapY(y)]);
                    currentX = x; currentY = y;
                    break;
                }
                case 'S': {
                    let [x2, y2, x, y] = chunk;
                    if (isRelative) {
                        x2 += currentX; y2 += currentY;
                        x += currentX; y += currentY;
                    }
                    pushMapped('S', [mapX(x2), mapY(y2), mapX(x), mapY(y)]);
                    currentX = x; currentY = y;
                    break;
                }
                case 'Q': {
                    let [x1, y1, x, y] = chunk;
                    if (isRelative) {
                        x1 += currentX; y1 += currentY;
                        x += currentX; y += currentY;
                    }
                    pushMapped('Q', [mapX(x1), mapY(y1), mapX(x), mapY(y)]);
                    currentX = x; currentY = y;
                    break;
                }
                case 'T': {
                    let [x, y] = chunk;
                    if (isRelative) { x += currentX; y += currentY; }
                    pushMapped('T', [mapX(x), mapY(y)]);
                    currentX = x; currentY = y;
                    break;
                }
                case 'A': {
                    let [rx, ry, rotation, largeArcFlag, sweepFlag, x, y] = chunk;
                    if (isRelative) { x += currentX; y += currentY; }
                    const newRx = Math.abs(rx * scaleX);
                    const newRy = Math.abs(ry * scaleY);

                    pushMapped('A', [newRx, newRy, rotation, Math.round(largeArcFlag), Math.round(sweepFlag), mapX(x), mapY(y)]);
                    currentX = x; currentY = y;
                    break;
                }
            }
            index += paramCount;
        }
    }
    return parts.join(' ');
}


export default function BoundingBox({ svgElement, elementId, containerElement, onTransformComplete }: BoundingBoxProps) {
    const [bbox, setBbox] = useState<BBox | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [activeHandle, setActiveHandle] = useState<HandleType | null>(null);
    const dragStartRef = useRef<{
        x: number;
        y: number;
        bbox: BBox;
        elementBBox: DOMRect;
        rotation?: {
            center: { x: number; y: number };
            startAngle: number;
            angle: number;
            originalTransform: string | null;
        };
    } | null>(null);
    const targetElementRef = useRef<SVGGraphicsElement | null>(null);

    // Use store to commit changes
    const { loadSVG } = useSVGEditorStore();

    useEffect(() => {
        updateBoundingBox();
    }, [svgElement, elementId, containerElement]);

    useEffect(() => {
        const handleResize = () => updateBoundingBox();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [svgElement, elementId, containerElement]);

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => handleMouseMove(e);
        const onMouseUp = () => handleMouseUp();

        if (isDragging) {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [isDragging, activeHandle]);

    const updateBoundingBox = () => {
        // Safe query for element (escape ID)
        // Note: CSS.escape needs polyfill in older browsers but modern ones support it
        // If elementId is simple, we can just use it. If it has numbers starting, CSS.escape is vital.
        const safeId = CSS.escape ? CSS.escape(elementId) : elementId;
        const element = svgElement.querySelector(`#${safeId}`);

        if (element && element instanceof SVGGraphicsElement) {
            targetElementRef.current = element;
            try {
                const elementBBox = element.getBBox();
                const containerRect = containerElement.getBoundingClientRect();

                const points = [
                    { x: elementBBox.x, y: elementBBox.y },
                    { x: elementBBox.x + elementBBox.width, y: elementBBox.y },
                    { x: elementBBox.x + elementBBox.width, y: elementBBox.y + elementBBox.height },
                    { x: elementBBox.x, y: elementBBox.y + elementBBox.height },
                ];

                const ctm = element.getScreenCTM();
                if (ctm) {
                    const transformed = points.map((point) => {
                        const svgPoint = svgElement.createSVGPoint();
                        svgPoint.x = point.x;
                        svgPoint.y = point.y;
                        return svgPoint.matrixTransform(ctm);
                    });

                    const xs = transformed.map((p) => p.x);
                    const ys = transformed.map((p) => p.y);
                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    const minY = Math.min(...ys);
                    const maxY = Math.max(...ys);

                    setBbox({
                        x: minX - containerRect.left,
                        y: minY - containerRect.top,
                        width: maxX - minX,
                        height: maxY - minY,
                    });
                }
            } catch (error) {
                console.error('Error calculating bounding box:', error);
                setBbox(null);
            }
        } else {
            targetElementRef.current = null;
            setBbox(null);
        }
    };

    const handleMouseDown = (e: React.MouseEvent, handle: HandleType) => {
        e.stopPropagation();
        if (!bbox || !targetElementRef.current) return;

        setIsDragging(true);
        const isCornerHandle = handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se';
        const rotateMode = isCornerHandle && (e.altKey || e.shiftKey);
        setActiveHandle(rotateMode ? 'rotate' : handle);

        const elementBBox = targetElementRef.current.getBBox();

        const nextDragStart: any = {
            x: e.clientX,
            y: e.clientY,
            bbox: { ...bbox },
            elementBBox: elementBBox,
        };

        if (rotateMode) {
            const svgCTM = svgElement.getScreenCTM();
            if (svgCTM) {
                const inverseCTM = svgCTM.inverse();
                const point = svgElement.createSVGPoint();
                point.x = e.clientX;
                point.y = e.clientY;
                const svgPoint = point.matrixTransform(inverseCTM);
                const center = {
                    x: elementBBox.x + elementBBox.width / 2,
                    y: elementBBox.y + elementBBox.height / 2,
                };
                const startAngle = Math.atan2(svgPoint.y - center.y, svgPoint.x - center.x);
                nextDragStart.rotation = {
                    center,
                    startAngle,
                    angle: 0,
                    originalTransform: targetElementRef.current.getAttribute('transform'),
                };
            }
        }

        dragStartRef.current = nextDragStart;
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging || !dragStartRef.current || !bbox || !activeHandle || !targetElementRef.current) return;

        if (activeHandle === 'rotate' && dragStartRef.current.rotation) {
            const svgCTM = svgElement.getScreenCTM();
            if (!svgCTM) return;
            const inverseCTM = svgCTM.inverse();
            const point = svgElement.createSVGPoint();
            point.x = e.clientX;
            point.y = e.clientY;
            const svgPoint = point.matrixTransform(inverseCTM);
            const rotation = dragStartRef.current.rotation;
            const currentAngle = Math.atan2(svgPoint.y - rotation.center.y, svgPoint.x - rotation.center.x);
            const deltaAngle = currentAngle - rotation.startAngle;

            const element = targetElementRef.current;
            const originalTransform = rotation.originalTransform;
            const rotateDeg = (deltaAngle * 180) / Math.PI;
            const rotateTransform = `rotate(${rotateDeg} ${rotation.center.x} ${rotation.center.y})`;
            const combined = originalTransform ? `${originalTransform} ${rotateTransform}` : rotateTransform;
            element.setAttribute('transform', combined.trim());
            updateBoundingBox();
            return;
        }

        const dx = e.clientX - dragStartRef.current.x;
        const dy = e.clientY - dragStartRef.current.y;
        const startBBox = dragStartRef.current.bbox;

        let newBBox = { ...bbox };

        switch (activeHandle) {
            case 'move':
                newBBox.x = startBBox.x + dx;
                newBBox.y = startBBox.y + dy;
                break;
            case 'nw':
                newBBox.x = startBBox.x + dx;
                newBBox.y = startBBox.y + dy;
                newBBox.width = startBBox.width - dx;
                newBBox.height = startBBox.height - dy;
                break;
            case 'ne':
                newBBox.y = startBBox.y + dy;
                newBBox.width = startBBox.width + dx;
                newBBox.height = startBBox.height - dy;
                break;
            case 'sw':
                newBBox.x = startBBox.x + dx;
                newBBox.width = startBBox.width - dx;
                newBBox.height = startBBox.height + dy;
                break;
            case 'se':
                newBBox.width = startBBox.width + dx;
                newBBox.height = startBBox.height + dy;
                break;
            case 'n':
                newBBox.y = startBBox.y + dy;
                newBBox.height = startBBox.height - dy;
                break;
            case 's':
                newBBox.height = startBBox.height + dy;
                break;
            case 'w':
                newBBox.x = startBBox.x + dx;
                newBBox.width = startBBox.width - dx;
                break;
            case 'e':
                newBBox.width = startBBox.width + dx;
                break;
        }

        if (newBBox.width < 10) newBBox.width = 10;
        if (newBBox.height < 10) newBBox.height = 10;

        setBbox(newBBox);
    };

    const handleMouseUp = () => {
        if (isDragging && dragStartRef.current && bbox && targetElementRef.current) {
            if (activeHandle === 'rotate') {
                const svgString = new XMLSerializer().serializeToString(svgElement);
                loadSVG(svgString);
            } else {
                applyTransform();
                const svgString = new XMLSerializer().serializeToString(svgElement);
                loadSVG(svgString);
            }
            if (onTransformComplete) onTransformComplete();
        }

        setIsDragging(false);
        setActiveHandle(null);
        dragStartRef.current = null;
    };

    const applyTransform = () => {
        if (!targetElementRef.current || !dragStartRef.current || !bbox || !svgElement) return;

        const element = targetElementRef.current;
        const elementBBox = dragStartRef.current.elementBBox;

        const svgCTM = svgElement.getScreenCTM();
        if (!svgCTM) return;
        const inverseCTM = svgCTM.inverse();
        const containerRect = containerElement.getBoundingClientRect();

        const screenToSvg = (x: number, y: number) => {
            const point = svgElement.createSVGPoint();
            point.x = x;
            point.y = y;
            return point.matrixTransform(inverseCTM);
        };

        const screenLeft = containerRect.left + bbox.x;
        const screenTop = containerRect.top + bbox.y;
        const screenRight = screenLeft + bbox.width;
        const screenBottom = screenTop + bbox.height;

        const svgTopLeft = screenToSvg(screenLeft, screenTop);
        const svgBottomRight = screenToSvg(screenRight, screenBottom);

        const newBBox = {
            x: Math.min(svgTopLeft.x, svgBottomRight.x),
            y: Math.min(svgTopLeft.y, svgBottomRight.y),
            width: Math.abs(svgBottomRight.x - svgTopLeft.x),
            height: Math.abs(svgBottomRight.y - svgTopLeft.y),
        };

        if (elementBBox.width < EPSILON || elementBBox.height < EPSILON) return;

        const scaleX = newBBox.width / elementBBox.width;
        const scaleY = newBBox.height / elementBBox.height;

        const mapX = (x: number) => (x - elementBBox.x) * scaleX + newBBox.x;
        const mapY = (y: number) => (y - elementBBox.y) * scaleY + newBBox.y;

        const applyMapToElement = (target: SVGGraphicsElement) => {
            const tag = target.tagName.toLowerCase();

            if (tag === 'g') {
                Array.from(target.children).forEach(child => {
                    if (child instanceof SVGGraphicsElement) applyMapToElement(child);
                });
                return;
            }

            if (tag === 'path') {
                const d = target.getAttribute('d') || '';
                const newD = transformPathData(d, mapX, mapY, scaleX, scaleY);
                target.setAttribute('d', newD);
            } else if (tag === 'rect') {
                const x = parseFloat(target.getAttribute('x') || '0');
                const y = parseFloat(target.getAttribute('y') || '0');
                const w = parseFloat(target.getAttribute('width') || '0');
                const h = parseFloat(target.getAttribute('height') || '0');

                const x1 = mapX(x);
                const y1 = mapY(y);
                const x2 = mapX(x + w);
                const y2 = mapY(y + h);

                target.setAttribute('x', Math.min(x1, x2).toString());
                target.setAttribute('y', Math.min(y1, y2).toString());
                target.setAttribute('width', Math.abs(x2 - x1).toString());
                target.setAttribute('height', Math.abs(y2 - y1).toString());
            } else if (tag === 'circle') {
                const cx = parseFloat(target.getAttribute('cx') || '0');
                const cy = parseFloat(target.getAttribute('cy') || '0');
                const r = parseFloat(target.getAttribute('r') || '0');

                const newCx = mapX(cx);
                const newCy = mapY(cy);
                const newR = r * Math.sqrt((scaleX * scaleX + scaleY * scaleY) / 2);

                target.setAttribute('cx', newCx.toString());
                target.setAttribute('cy', newCy.toString());
                target.setAttribute('r', newR.toString());
            } else if (tag === 'ellipse') {
                const cx = parseFloat(target.getAttribute('cx') || '0');
                const cy = parseFloat(target.getAttribute('cy') || '0');
                const rx = parseFloat(target.getAttribute('rx') || '0');
                const ry = parseFloat(target.getAttribute('ry') || '0');

                target.setAttribute('cx', mapX(cx).toString());
                target.setAttribute('cy', mapY(cy).toString());
                target.setAttribute('rx', (rx * scaleX).toString());
                target.setAttribute('ry', (ry * scaleY).toString());
            } else if (tag === 'line') {
                const x1 = parseFloat(target.getAttribute('x1') || '0');
                const y1 = parseFloat(target.getAttribute('y1') || '0');
                const x2 = parseFloat(target.getAttribute('x2') || '0');
                const y2 = parseFloat(target.getAttribute('y2') || '0');

                target.setAttribute('x1', mapX(x1).toString());
                target.setAttribute('y1', mapY(y1).toString());
                target.setAttribute('x2', mapX(x2).toString());
                target.setAttribute('y2', mapY(y2).toString());
            } else if (tag === 'polygon' || tag === 'polyline') {
                const points = target.getAttribute('points') || '';
                const coords = parseNumbers(points);
                const newCoords: number[] = [];
                for (let i = 0; i < coords.length; i += 2) {
                    newCoords.push(mapX(coords[i]));
                    newCoords.push(mapY(coords[i + 1]));
                }
                target.setAttribute('points', formatNumberList(newCoords));
            }
        };

        applyMapToElement(element);
    };

    if (!bbox) return null;

    return (
        <div
            className="absolute border-2 border-blue-500 pointer-events-none z-50"
            style={{
                left: bbox.x,
                top: bbox.y,
                width: bbox.width,
                height: bbox.height,
                boxSizing: 'border-box',
            }}
        >
            <div className="absolute inset-0 pointer-events-auto cursor-move" onMouseDown={(e) => handleMouseDown(e, 'move')} />
            <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-500 pointer-events-auto cursor-nw-resize" onMouseDown={(e) => handleMouseDown(e, 'nw')} />
            <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-500 pointer-events-auto cursor-ne-resize" onMouseDown={(e) => handleMouseDown(e, 'ne')} />
            <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-blue-500 pointer-events-auto cursor-sw-resize" onMouseDown={(e) => handleMouseDown(e, 'sw')} />
            <div className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-blue-500 pointer-events-auto cursor-se-resize" onMouseDown={(e) => handleMouseDown(e, 'se')} />
            <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border border-blue-500 pointer-events-auto cursor-n-resize" onMouseDown={(e) => handleMouseDown(e, 'n')} />
            <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border border-blue-500 pointer-events-auto cursor-s-resize" onMouseDown={(e) => handleMouseDown(e, 's')} />
            <div className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-3 h-3 bg-white border border-blue-500 pointer-events-auto cursor-w-resize" onMouseDown={(e) => handleMouseDown(e, 'w')} />
            <div className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 bg-white border border-blue-500 pointer-events-auto cursor-e-resize" onMouseDown={(e) => handleMouseDown(e, 'e')} />
        </div>
    );
}
