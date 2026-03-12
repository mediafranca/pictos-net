/**
 * Bounding Box Component
 * Implements Move, Scale and Rotate operations with correct SVG coordinate transformation
 */

import React, { useEffect, useState, useRef } from 'react';
import { useSVGEditorStore } from '../../stores/svgEditorStore';
import { useTranslation } from '../../hooks/useTranslation';

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

const SVG_NS = 'http://www.w3.org/2000/svg';
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

function rotatePoint(x: number, y: number, cx: number, cy: number, angleRad: number) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = x - cx;
    const dy = y - cy;
    return {
        x: cx + dx * cos - dy * sin,
        y: cy + dx * sin + dy * cos,
    };
}

function rotatePathData(d: string, cx: number, cy: number, angleRad: number): string {
    const commandRegex = /([a-zA-Z])([^a-zA-Z]*)/g;
    const paramCounts: Record<string, number> = {
        M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
    };

    const angleDeg = (angleRad * 180) / Math.PI;
    const parts: string[] = [];
    let match: RegExpExecArray | null;
    let currentX = 0;
    let currentY = 0;
    let startX = 0;
    let startY = 0;

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
        if (!paramCount || params.length === 0) {
            continue;
        }

        const pushMapped = (cmd: string, values: number[]) => {
            parts.push(`${cmd}${formatNumberList(values)}`);
        };

        if (upper === 'M') {
            let index = 0;
            while (index + 1 < params.length) {
                let x = params[index];
                let y = params[index + 1];
                if (isRelative) {
                    x += currentX;
                    y += currentY;
                }
                const rotated = rotatePoint(x, y, cx, cy, angleRad);
                if (index === 0) {
                    startX = x;
                    startY = y;
                    pushMapped('M', [rotated.x, rotated.y]);
                } else {
                    pushMapped('L', [rotated.x, rotated.y]);
                }
                currentX = x;
                currentY = y;
                index += 2;
            }
            continue;
        }

        let index = 0;
        while (index + paramCount - 1 < params.length) {
            const chunk = params.slice(index, index + paramCount);

            switch (upper) {
                case 'L': {
                    let x = chunk[0];
                    let y = chunk[1];
                    if (isRelative) { x += currentX; y += currentY; }
                    const rotated = rotatePoint(x, y, cx, cy, angleRad);
                    pushMapped('L', [rotated.x, rotated.y]);
                    currentX = x; currentY = y;
                    break;
                }
                case 'H': {
                    let x = chunk[0];
                    if (isRelative) x += currentX;
                    const rotated = rotatePoint(x, currentY, cx, cy, angleRad);
                    pushMapped('L', [rotated.x, rotated.y]);
                    currentX = x;
                    break;
                }
                case 'V': {
                    let y = chunk[0];
                    if (isRelative) y += currentY;
                    const rotated = rotatePoint(currentX, y, cx, cy, angleRad);
                    pushMapped('L', [rotated.x, rotated.y]);
                    currentY = y;
                    break;
                }
                case 'C': {
                    let [x1, y1, x2, y2, x, y] = chunk;
                    if (isRelative) { x1 += currentX; y1 += currentY; x2 += currentX; y2 += currentY; x += currentX; y += currentY; }
                    const r1 = rotatePoint(x1, y1, cx, cy, angleRad);
                    const r2 = rotatePoint(x2, y2, cx, cy, angleRad);
                    const r = rotatePoint(x, y, cx, cy, angleRad);
                    pushMapped('C', [r1.x, r1.y, r2.x, r2.y, r.x, r.y]);
                    currentX = x; currentY = y;
                    break;
                }
                case 'S': {
                    let [x2, y2, x, y] = chunk;
                    if (isRelative) { x2 += currentX; y2 += currentY; x += currentX; y += currentY; }
                    const r2 = rotatePoint(x2, y2, cx, cy, angleRad);
                    const r = rotatePoint(x, y, cx, cy, angleRad);
                    pushMapped('S', [r2.x, r2.y, r.x, r.y]);
                    currentX = x; currentY = y;
                    break;
                }
                case 'Q': {
                    let [x1, y1, x, y] = chunk;
                    if (isRelative) { x1 += currentX; y1 += currentY; x += currentX; y += currentY; }
                    const r1 = rotatePoint(x1, y1, cx, cy, angleRad);
                    const r = rotatePoint(x, y, cx, cy, angleRad);
                    pushMapped('Q', [r1.x, r1.y, r.x, r.y]);
                    currentX = x; currentY = y;
                    break;
                }
                case 'T': {
                    let [x, y] = chunk;
                    if (isRelative) { x += currentX; y += currentY; }
                    const r = rotatePoint(x, y, cx, cy, angleRad);
                    pushMapped('T', [r.x, r.y]);
                    currentX = x; currentY = y;
                    break;
                }
                case 'A': {
                    let [rx, ry, rotation, largeArcFlag, sweepFlag, x, y] = chunk;
                    if (isRelative) { x += currentX; y += currentY; }
                    const r = rotatePoint(x, y, cx, cy, angleRad);
                    const newRotation = rotation + angleDeg;
                    pushMapped('A', [Math.abs(rx), Math.abs(ry), newRotation, Math.round(largeArcFlag), Math.round(sweepFlag), r.x, r.y]);
                    currentX = x; currentY = y;
                    break;
                }
                default: break;
            }
            index += paramCount;
        }
    }
    return parts.join(' ');
}

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
    let startX = 0;
    let startY = 0;

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

        if (upper === 'M') {
            let index = 0;
            while (index + 1 < params.length) {
                let x = params[index];
                let y = params[index + 1];
                if (isRelative) { x += currentX; y += currentY; }
                if (index === 0) {
                    startX = x; startY = y;
                    pushMapped('M', [mapX(x), mapY(y)]);
                } else {
                    pushMapped('L', [mapX(x), mapY(y)]);
                }
                currentX = x; currentY = y;
                index += 2;
            }
            continue;
        }

        let index = 0;
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
                    if (isRelative) x += currentX;
                    pushMapped('L', [mapX(x), mapY(currentY)]);
                    currentX = x;
                    break;
                }
                case 'V': {
                    let y = chunk[0];
                    if (isRelative) y += currentY;
                    pushMapped('L', [mapX(currentX), mapY(y)]);
                    currentY = y;
                    break;
                }
                case 'C': {
                    let [x1, y1, x2, y2, x, y] = chunk;
                    if (isRelative) { x1 += currentX; y1 += currentY; x2 += currentX; y2 += currentY; x += currentX; y += currentY; }
                    pushMapped('C', [mapX(x1), mapY(y1), mapX(x2), mapY(y2), mapX(x), mapY(y)]);
                    currentX = x; currentY = y;
                    break;
                }
                case 'S': {
                    let [x2, y2, x, y] = chunk;
                    if (isRelative) { x2 += currentX; y2 += currentY; x += currentX; y += currentY; }
                    pushMapped('S', [mapX(x2), mapY(y2), mapX(x), mapY(y)]);
                    currentX = x; currentY = y;
                    break;
                }
                case 'Q': {
                    let [x1, y1, x, y] = chunk;
                    if (isRelative) { x1 += currentX; y1 += currentY; x += currentX; y += currentY; }
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
                    rx = Math.abs(rx * scaleX);
                    ry = Math.abs(ry * scaleY);
                    pushMapped('A', [rx, ry, rotation, Math.round(largeArcFlag), Math.round(sweepFlag), mapX(x), mapY(y)]);
                    currentX = x; currentY = y;
                    break;
                }
                default: break;
            }
            index += paramCount;
        }
    }
    return parts.join(' ');
}

export default function BoundingBox({ svgElement, elementId, containerElement, onTransformComplete }: BoundingBoxProps) {
    const { t } = useTranslation();
    const zoom = useSVGEditorStore(state => state.viewport.zoom);
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
    const { loadSVG } = useSVGEditorStore();

    useEffect(() => {
        updateBoundingBox();
    }, [svgElement, elementId, containerElement]);

    useEffect(() => {
        const handleResize = () => updateBoundingBox();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [svgElement, elementId, containerElement]);

    const updateBoundingBox = () => {
        const element = svgElement.querySelector(`#${CSS.escape(elementId)}`);
        if (element && element instanceof SVGGraphicsElement) {
            targetElementRef.current = element;
            try {
                const elementBBox = element.getBBox();

                const points = [
                    { x: elementBBox.x, y: elementBBox.y },
                    { x: elementBBox.x + elementBBox.width, y: elementBBox.y },
                    { x: elementBBox.x + elementBBox.width, y: elementBBox.y + elementBBox.height },
                    { x: elementBBox.x, y: elementBBox.y + elementBBox.height },
                ];

                // Use relative CTM (element to SVG root) so bbox is in SVG-local coords.
                // The CSS transform on the viewport div handles visual placement.
                const elementCTM = element.getScreenCTM();
                const svgCTM = svgElement.getScreenCTM();

                if (elementCTM && svgCTM) {
                    const relCTM = svgCTM.inverse().multiply(elementCTM);
                    const transformed = points.map((point) => {
                        const svgPoint = svgElement.createSVGPoint();
                        svgPoint.x = point.x;
                        svgPoint.y = point.y;
                        return svgPoint.matrixTransform(relCTM);
                    });

                    const xs = transformed.map((p) => p.x);
                    const ys = transformed.map((p) => p.y);
                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    const minY = Math.min(...ys);
                    const maxY = Math.max(...ys);

                    setBbox({
                        x: minX,
                        y: minY,
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
        const isCornerHandle = ['nw', 'ne', 'sw', 'se'].includes(handle);
        const isRotateHandle = handle === 'rotate';
        const rotateMode = isRotateHandle || (isCornerHandle && (e.altKey || e.shiftKey));

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
            rotation.angle = deltaAngle;

            const element = targetElementRef.current;
            const originalTransform = rotation.originalTransform;
            const rotateDeg = (deltaAngle * 180) / Math.PI;
            const rotateTransform = `rotate(${rotateDeg} ${rotation.center.x} ${rotation.center.y})`;
            const combined = originalTransform ? `${originalTransform} ${rotateTransform}` : rotateTransform;
            element.setAttribute('transform', combined.trim());
            updateBoundingBox();
            return;
        }

        // Screen-pixel deltas scaled to SVG-local coords via zoom
        const { zoom } = useSVGEditorStore.getState().viewport;
        const dx = (e.clientX - dragStartRef.current.x) / zoom;
        const dy = (e.clientY - dragStartRef.current.y) / zoom;
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
                applyRotation();
            } else {
                applyTransform();
            }
        }

        setIsDragging(false);
        setActiveHandle(null);
        dragStartRef.current = null;
    };

    const applyTransform = () => {
        if (!targetElementRef.current || !dragStartRef.current || !bbox || !svgElement) return;

        const element = targetElementRef.current;
        const elementBBox = dragStartRef.current.elementBBox;

        // Use the element's own CTM to map screen coordinates into the element's local
        // coordinate space — where x, y, cx, cy, d etc. are defined.
        let inverseCTM: DOMMatrix | null = null;
        const elementCTM = element.getScreenCTM();
        if (elementCTM) {
            inverseCTM = elementCTM.inverse();
        } else {
            const svgCTM = svgElement.getScreenCTM();
            if (svgCTM) inverseCTM = svgCTM.inverse();
        }

        if (!inverseCTM) return;

        // BBox is in SVG-local coords. Convert to screen using svgElement.getScreenCTM()
        // so the existing screenToLocal logic works correctly with the CSS transform.
        const svgCTM = svgElement.getScreenCTM();
        if (!svgCTM) return;

        const screenToLocal = (x: number, y: number) => {
            const point = svgElement.createSVGPoint();
            point.x = x;
            point.y = y;
            return point.matrixTransform(inverseCTM!);
        };

        const screenLeft = svgCTM.a * bbox.x + svgCTM.e;
        const screenTop = svgCTM.d * bbox.y + svgCTM.f;
        const screenRight = svgCTM.a * (bbox.x + bbox.width) + svgCTM.e;
        const screenBottom = svgCTM.d * (bbox.y + bbox.height) + svgCTM.f;

        const svgTopLeft = screenToLocal(screenLeft, screenTop);
        const svgBottomRight = screenToLocal(screenRight, screenBottom);

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

        const applyMapToElement = (target: SVGGraphicsElement): SVGGraphicsElement => {
            const tag = target.tagName.toLowerCase();

            switch (tag) {
                case 'rect': {
                    const x = parseFloat(target.getAttribute('x') || '0');
                    const y = parseFloat(target.getAttribute('y') || '0');
                    const width = parseFloat(target.getAttribute('width') || '0');
                    const height = parseFloat(target.getAttribute('height') || '0');
                    const rx = target.getAttribute('rx');
                    const ry = target.getAttribute('ry');

                    target.setAttribute('x', formatNumber(mapX(x)));
                    target.setAttribute('y', formatNumber(mapY(y)));
                    target.setAttribute('width', formatNumber(width * scaleX));
                    target.setAttribute('height', formatNumber(height * scaleY));

                    if (rx !== null) target.setAttribute('rx', formatNumber(parseFloat(rx) * scaleX));
                    if (ry !== null) target.setAttribute('ry', formatNumber(parseFloat(ry) * scaleY));
                    return target;
                }
                case 'circle': {
                    const cx = parseFloat(target.getAttribute('cx') || '0');
                    const cy = parseFloat(target.getAttribute('cy') || '0');
                    const r = parseFloat(target.getAttribute('r') || '0');
                    const nextCx = mapX(cx);
                    const nextCy = mapY(cy);
                    const nextRx = Math.abs(r * scaleX);
                    const nextRy = Math.abs(r * scaleY);

                    if (Math.abs(scaleX - scaleY) > 0.001) {
                        const ellipse = target.ownerDocument.createElementNS(SVG_NS, 'ellipse');
                        Array.from(target.attributes).forEach((attr) => {
                            if (attr.name === 'cx' || attr.name === 'cy' || attr.name === 'r') return;
                            ellipse.setAttribute(attr.name, attr.value);
                        });
                        ellipse.setAttribute('cx', formatNumber(nextCx));
                        ellipse.setAttribute('cy', formatNumber(nextCy));
                        ellipse.setAttribute('rx', formatNumber(nextRx));
                        ellipse.setAttribute('ry', formatNumber(nextRy));
                        target.parentNode?.replaceChild(ellipse, target);
                        return ellipse as SVGGraphicsElement;
                    }

                    target.setAttribute('cx', formatNumber(nextCx));
                    target.setAttribute('cy', formatNumber(nextCy));
                    target.setAttribute('r', formatNumber(nextRx));
                    return target;
                }
                case 'ellipse': {
                    const cx = parseFloat(target.getAttribute('cx') || '0');
                    const cy = parseFloat(target.getAttribute('cy') || '0');
                    const rx = parseFloat(target.getAttribute('rx') || '0');
                    const ry = parseFloat(target.getAttribute('ry') || '0');

                    target.setAttribute('cx', formatNumber(mapX(cx)));
                    target.setAttribute('cy', formatNumber(mapY(cy)));
                    target.setAttribute('rx', formatNumber(Math.abs(rx * scaleX)));
                    target.setAttribute('ry', formatNumber(Math.abs(ry * scaleY)));
                    return target;
                }
                case 'line': {
                    const x1 = parseFloat(target.getAttribute('x1') || '0');
                    const y1 = parseFloat(target.getAttribute('y1') || '0');
                    const x2 = parseFloat(target.getAttribute('x2') || '0');
                    const y2 = parseFloat(target.getAttribute('y2') || '0');

                    target.setAttribute('x1', formatNumber(mapX(x1)));
                    target.setAttribute('y1', formatNumber(mapY(y1)));
                    target.setAttribute('x2', formatNumber(mapX(x2)));
                    target.setAttribute('y2', formatNumber(mapY(y2)));
                    return target;
                }
                case 'polyline':
                case 'polygon': {
                    const points = target.getAttribute('points') || '';
                    const nums = parseNumbers(points);
                    const mapped: number[] = [];
                    for (let i = 0; i + 1 < nums.length; i += 2) {
                        mapped.push(mapX(nums[i]), mapY(nums[i + 1]));
                    }
                    const formatted = [];
                    for (let i = 0; i + 1 < mapped.length; i += 2) {
                        formatted.push(`${formatNumber(mapped[i])},${formatNumber(mapped[i + 1])}`);
                    }
                    target.setAttribute('points', formatted.join(' '));
                    return target;
                }
                case 'path': {
                    const d = target.getAttribute('d');
                    if (d) {
                        const transformed = transformPathData(d, mapX, mapY, scaleX, scaleY);
                        target.setAttribute('d', transformed);
                    }
                    return target;
                }
                default:
                    return target;
            }
        };

        let updatedTarget = element;

        if (element.tagName.toLowerCase() === 'g') {
            // Groups: compose an affine transform on the <g> itself so all
            // children move/scale together, preserving spatial relationships.
            const tx = newBBox.x - scaleX * elementBBox.x;
            const ty = newBBox.y - scaleY * elementBBox.y;
            const delta = new DOMMatrix([scaleX, 0, 0, scaleY, tx, ty]);

            let existing = new DOMMatrix();
            const baseVal = (element as SVGGraphicsElement).transform?.baseVal;
            if (baseVal) {
                for (let i = 0; i < baseVal.numberOfItems; i++) {
                    const m = baseVal.getItem(i).matrix;
                    existing = existing.multiply(new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]));
                }
            }

            const composed = existing.multiply(delta);
            element.setAttribute('transform',
                `matrix(${composed.a},${composed.b},${composed.c},${composed.d},${composed.e},${composed.f})`
            );
        } else {
            updatedTarget = applyMapToElement(element);
        }

        if (updatedTarget !== element) {
            targetElementRef.current = updatedTarget;
        }

        const serializer = new XMLSerializer();
        const updatedSVG = serializer.serializeToString(svgElement);
        loadSVG(updatedSVG);

        updateBoundingBox();

        if (onTransformComplete) {
            onTransformComplete();
        }
    };

    const applyRotation = () => {
        if (!targetElementRef.current || !dragStartRef.current || !svgElement) return;
        const rotation = dragStartRef.current.rotation;
        if (!rotation) return;
        if (Math.abs(rotation.angle) < 0.0001) {
            const originalTransform = rotation.originalTransform;
            if (originalTransform) {
                targetElementRef.current.setAttribute('transform', originalTransform);
            } else {
                targetElementRef.current.removeAttribute('transform');
            }
            return;
        }

        const element = targetElementRef.current;
        const center = rotation.center;
        const angle = rotation.angle;

        const applyRotateToElement = (target: SVGGraphicsElement): SVGGraphicsElement => {
            const tag = target.tagName.toLowerCase();
            const doc = target.ownerDocument;

            switch (tag) {
                case 'rect': {
                    const x = parseFloat(target.getAttribute('x') || '0');
                    const y = parseFloat(target.getAttribute('y') || '0');
                    const width = parseFloat(target.getAttribute('width') || '0');
                    const height = parseFloat(target.getAttribute('height') || '0');

                    const corners = [
                        rotatePoint(x, y, center.x, center.y, angle),
                        rotatePoint(x + width, y, center.x, center.y, angle),
                        rotatePoint(x + width, y + height, center.x, center.y, angle),
                        rotatePoint(x, y + height, center.x, center.y, angle),
                    ];

                    const polygon = doc.createElementNS(SVG_NS, 'polygon');
                    Array.from(target.attributes).forEach((attr) => {
                        if (['x', 'y', 'width', 'height', 'rx', 'ry'].includes(attr.name)) return;
                        polygon.setAttribute(attr.name, attr.value);
                    });
                    polygon.setAttribute('points', corners.map((p) => `${formatNumber(p.x)},${formatNumber(p.y)}`).join(' '));
                    target.parentNode?.replaceChild(polygon, target);
                    return polygon as SVGGraphicsElement;
                }
                case 'circle':
                case 'ellipse': {
                    const cx = parseFloat(target.getAttribute('cx') || '0');
                    const cy = parseFloat(target.getAttribute('cy') || '0');
                    const rx = tag === 'circle' ? parseFloat(target.getAttribute('r') || '0') : parseFloat(target.getAttribute('rx') || '0');
                    const ry = tag === 'circle' ? parseFloat(target.getAttribute('r') || '0') : parseFloat(target.getAttribute('ry') || '0');

                    const path = doc.createElementNS(SVG_NS, 'path');
                    Array.from(target.attributes).forEach((attr) => {
                        if (['cx', 'cy', 'r', 'rx', 'ry'].includes(attr.name)) return;
                        path.setAttribute(attr.name, attr.value);
                    });
                    const d = [
                        `M ${formatNumber(cx + rx)} ${formatNumber(cy)}`,
                        `A ${formatNumber(rx)} ${formatNumber(ry)} 0 1 0 ${formatNumber(cx - rx)} ${formatNumber(cy)}`,
                        `A ${formatNumber(rx)} ${formatNumber(ry)} 0 1 0 ${formatNumber(cx + rx)} ${formatNumber(cy)}`,
                        'Z',
                    ].join(' ');
                    const rotated = rotatePathData(d, center.x, center.y, angle);
                    path.setAttribute('d', rotated);
                    target.parentNode?.replaceChild(path, target);
                    return path as SVGGraphicsElement;
                }
                case 'line': {
                    const x1 = parseFloat(target.getAttribute('x1') || '0');
                    const y1 = parseFloat(target.getAttribute('y1') || '0');
                    const x2 = parseFloat(target.getAttribute('x2') || '0');
                    const y2 = parseFloat(target.getAttribute('y2') || '0');

                    const p1 = rotatePoint(x1, y1, center.x, center.y, angle);
                    const p2 = rotatePoint(x2, y2, center.x, center.y, angle);

                    target.setAttribute('x1', formatNumber(p1.x));
                    target.setAttribute('y1', formatNumber(p1.y));
                    target.setAttribute('x2', formatNumber(p2.x));
                    target.setAttribute('y2', formatNumber(p2.y));
                    return target;
                }
                case 'polyline':
                case 'polygon': {
                    const points = target.getAttribute('points') || '';
                    const nums = parseNumbers(points);
                    const mapped: number[] = [];
                    for (let i = 0; i + 1 < nums.length; i += 2) {
                        const rotated = rotatePoint(nums[i], nums[i + 1], center.x, center.y, angle);
                        mapped.push(rotated.x, rotated.y);
                    }
                    const formatted = [];
                    for (let i = 0; i + 1 < mapped.length; i += 2) {
                        formatted.push(`${formatNumber(mapped[i])},${formatNumber(mapped[i + 1])}`);
                    }
                    target.setAttribute('points', formatted.join(' '));
                    return target;
                }
                case 'path': {
                    const d = target.getAttribute('d');
                    if (d) {
                        const rotated = rotatePathData(d, center.x, center.y, angle);
                        target.setAttribute('d', rotated);
                    }
                    return target;
                }
                default: return target;
            }
        };

        let updatedTarget = element;

        if (element.tagName.toLowerCase() === 'g') {
            // Groups: the drag preview (handleMouseMove) already set the
            // correct composed transform on the <g> element:
            //   originalTransform + " rotate(θ, cx, cy)"
            // Nothing else to do — just serialize below.
        } else {
            updatedTarget = applyRotateToElement(element);

            const originalTransform = rotation.originalTransform;
            if (originalTransform) {
                updatedTarget.setAttribute('transform', originalTransform);
            } else {
                updatedTarget.removeAttribute('transform');
            }
        }

        if (updatedTarget !== element) {
            targetElementRef.current = updatedTarget;
        }

        const serializer = new XMLSerializer();
        const updatedSVG = serializer.serializeToString(svgElement);
        loadSVG(updatedSVG);

        updateBoundingBox();

        if (onTransformComplete) {
            onTransformComplete();
        }
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [isDragging, bbox, activeHandle]);

    if (!bbox) return null;

    // Counter-scale so handles keep a constant screen size regardless of zoom
    const iz = 1 / zoom;                // inverse zoom
    const handlePx = 12;                 // handle diameter in screen px
    const handleSvg = handlePx * iz;     // handle size in SVG-local units
    const halfH = handleSvg / 2;
    const borderW = Math.max(1, iz);     // border always ~1 screen px
    const rotStemH = 24 * iz;            // rotation stem height
    const rotBtnSvg = 20 * iz;           // rotation button size
    const rotIconSvg = 12 * iz;          // rotation icon size

    const handleStyle: React.CSSProperties = {
        position: 'absolute',
        width: `${handleSvg}px`,
        height: `${handleSvg}px`,
        borderRadius: '50%',
        background: '#2563eb',
        border: `${borderW}px solid white`,
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
        cursor: 'pointer',
    };

    return (
        <div
            className="absolute pointer-events-auto"
            style={{
                left: `${bbox.x}px`,
                top: `${bbox.y}px`,
                width: `${bbox.width}px`,
                height: `${bbox.height}px`,
                cursor: isDragging && activeHandle === 'move' ? 'grabbing' : 'grab',
                border: `${borderW}px solid #2563eb`,
                boxShadow: `0 0 0 ${borderW}px rgba(255,255,255,0.4)`,
                overflow: 'visible',
            }}
            onMouseDown={(e) => handleMouseDown(e, 'move')}
        >
            {/* Rotation stem + button */}
            <div style={{
                position: 'absolute',
                width: `${borderW}px`,
                height: `${rotStemH}px`,
                background: '#2563eb',
                left: '50%',
                top: `${-rotStemH}px`,
                transform: 'translateX(-50%)',
            }} />
            <div
                style={{
                    position: 'absolute',
                    width: `${rotBtnSvg}px`,
                    height: `${rotBtnSvg}px`,
                    background: 'white',
                    border: `${borderW}px solid #2563eb`,
                    borderRadius: '50%',
                    cursor: 'grab',
                    zIndex: 50,
                    left: '50%',
                    top: `${-(rotStemH + rotBtnSvg * 0.65)}px`,
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#2563eb',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                }}
                onMouseDown={(e) => handleMouseDown(e, 'rotate')}
                title={t('svgEditor.rotate')}
            >
                <svg width={rotIconSvg} height={rotIconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6M21.34 5.5A10 10 0 1 1 11.26 2.8" />
                </svg>
            </div>

            {/* Resize handles — positioned with negative offsets in SVG-local units */}
            <div style={{ ...handleStyle, top: `${-halfH}px`, left: `${-halfH}px`, cursor: 'nwse-resize' }} onMouseDown={(e) => handleMouseDown(e, 'nw')} />
            <div style={{ ...handleStyle, top: `${-halfH}px`, right: `${-halfH}px`, cursor: 'nesw-resize' }} onMouseDown={(e) => handleMouseDown(e, 'ne')} />
            <div style={{ ...handleStyle, bottom: `${-halfH}px`, left: `${-halfH}px`, cursor: 'nesw-resize' }} onMouseDown={(e) => handleMouseDown(e, 'sw')} />
            <div style={{ ...handleStyle, bottom: `${-halfH}px`, right: `${-halfH}px`, cursor: 'nwse-resize' }} onMouseDown={(e) => handleMouseDown(e, 'se')} />
            <div style={{ ...handleStyle, top: `${-halfH}px`, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' }} onMouseDown={(e) => handleMouseDown(e, 'n')} />
            <div style={{ ...handleStyle, bottom: `${-halfH}px`, left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' }} onMouseDown={(e) => handleMouseDown(e, 's')} />
            <div style={{ ...handleStyle, left: `${-halfH}px`, top: '50%', transform: 'translateY(-50%)', cursor: 'ew-resize' }} onMouseDown={(e) => handleMouseDown(e, 'w')} />
            <div style={{ ...handleStyle, right: `${-halfH}px`, top: '50%', transform: 'translateY(-50%)', cursor: 'ew-resize' }} onMouseDown={(e) => handleMouseDown(e, 'e')} />
        </div>
    );
}
