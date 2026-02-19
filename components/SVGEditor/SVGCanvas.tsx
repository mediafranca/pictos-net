/**
 * SVG Canvas Component
 * Renders SVG with accurate coordinate mapping using getScreenCTM()
 * Implements bounding box for selected elements
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Upload, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '../ui/button';
import { useSVGEditorStore } from '../../stores/svgEditorStore';
import { normalizeSVG, parseSVGToDOM } from '../../utils/svgNormalizer';
import BoundingBox from './BoundingBox';
// Import directly from the extraction path if aliases are tricky
import { updateDynamicStyles } from '../../lib/style-editor/lib/utils/cssGenerator';

export default function SVGCanvas() {
    const {
        svgDocument,
        loadSVG,
        updateSVGDOM,
        selectedElementId,
        selectElement,
        styleDefinitions,
        keyframes,
    } = useSVGEditorStore();

    const [refreshKey, setRefreshKey] = useState(0);
    const svgContainerRef = useRef<HTMLDivElement>(null);
    const svgContentRef = useRef<HTMLDivElement>(null);
    const canvasFrameRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [svgElement, setSvgElement] = useState<SVGSVGElement | null>(null);
    const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
    const [zoom, setZoom] = useState(1);
    const [fitZoom, setFitZoom] = useState(1);
    const [fitMode, setFitMode] = useState(true);

    const MIN_ZOOM = 0.1;
    const MAX_ZOOM = 8;
    const ZOOM_STEP = 1.1;

    const clampZoom = useCallback((value: number) => {
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
    }, []);

    const computeFitZoom = useCallback(() => {
        if (!canvasSize || !svgContainerRef.current) return 1;

        const container = svgContainerRef.current;
        const style = window.getComputedStyle(container);
        const paddingX =
            parseFloat(style.paddingLeft || '0') + parseFloat(style.paddingRight || '0');
        const paddingY =
            parseFloat(style.paddingTop || '0') + parseFloat(style.paddingBottom || '0');
        const availableWidth = Math.max(1, container.clientWidth - paddingX);
        const availableHeight = Math.max(1, container.clientHeight - paddingY);

        const scale = Math.min(
            availableWidth / canvasSize.width,
            availableHeight / canvasSize.height
        );

        return clampZoom(scale);
    }, [canvasSize, clampZoom]);

    useEffect(() => {
        if (svgDocument && svgContentRef.current) {
            // Parse and normalize SVG
            const normalized = normalizeSVG(svgDocument);
            const dom = parseSVGToDOM(normalized.svg);

            if (dom) {
                updateSVGDOM(dom);
            }

            // Render SVG
            svgContentRef.current.innerHTML = normalized.svg;
            const svg = svgContentRef.current.querySelector('svg');

            if (svg) {
                svg.style.width = '100%';
                svg.style.height = '100%';
                svg.style.display = 'block';
                setSvgElement(svg);

                let width = parseFloat(svg.getAttribute('width') || '');
                let height = parseFloat(svg.getAttribute('height') || '');

                if ((!width || !height) && svg.viewBox && svg.viewBox.baseVal) {
                    // Handle viewBox baseVal access safely
                    try {
                        if (svg.viewBox.baseVal.width) width = svg.viewBox.baseVal.width;
                        if (svg.viewBox.baseVal.height) height = svg.viewBox.baseVal.height;
                    } catch (e) { /* ignore */ }
                }

                if ((!width || !height) && svg.width && svg.height) {
                    try {
                        if (!width && svg.width.baseVal) width = svg.width.baseVal.value;
                        if (!height && svg.height.baseVal) height = svg.height.baseVal.value;
                    } catch (e) { /* ignore */ }
                }

                if ((!width || !height) && typeof svg.getBBox === 'function') {
                    try {
                        const bbox = svg.getBBox();
                        if (bbox.width && bbox.height) {
                            width = bbox.width;
                            height = bbox.height;
                        }
                    } catch {
                        // ignore bbox errors (e.g. if not in document yet)
                    }
                }

                if (!width || !height) {
                    width = 300;
                    height = 150;
                }
                setCanvasSize({ width, height });
            }
        }
    }, [svgDocument, updateSVGDOM]);

    useEffect(() => {
        if (!document.getElementById('dynamic-svg-styles')) {
            const styleTag = document.createElement('style');
            styleTag.id = 'dynamic-svg-styles';
            document.head.appendChild(styleTag);
        }
        // Update extracted styles from extracted files logic if necessary
        // Here we pass the definitions from store to the generator
        if (styleDefinitions && keyframes) {
            try {
                updateDynamicStyles(styleDefinitions, keyframes);
            } catch (e) {
                console.warn("Failed to update dynamic styles", e);
            }
        }
    }, [styleDefinitions, keyframes]);

    useEffect(() => {
        if (!canvasSize) return;
        const nextFit = computeFitZoom();
        setFitZoom(nextFit);
        setZoom(nextFit);
        setFitMode(true);
    }, [canvasSize, computeFitZoom]);

    useEffect(() => {
        if (!svgContainerRef.current) return;

        const container = svgContainerRef.current;
        const observer = new ResizeObserver(() => {
            const nextFit = computeFitZoom();
            setFitZoom(nextFit);
            if (fitMode) {
                setZoom(nextFit);
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, [computeFitZoom, fitMode]);

    useEffect(() => {
        if (!svgDocument) return;
        setRefreshKey(prev => prev + 1);
    }, [zoom, svgDocument]);

    useEffect(() => {
        if (!svgElement) return;

        const handleSvgClick = (event: MouseEvent) => {
            const target = event.target;
            if (!(target instanceof Element)) {
                selectElement(null);
                return;
            }

            if (target === svgElement) {
                selectElement(null);
                return;
            }

            // Prioritize selecting the direct element (leaf) if it has an ID, 
            // otherwise look for a group, 
            // otherwise use the target itself if it matches criteria.

            // Try explicit element first
            const elementTarget = target.closest('[id]');

            // If the element is found and is not the root SVG
            if (elementTarget && elementTarget !== svgElement) {
                const id = elementTarget.getAttribute('id');
                selectElement(id);
                return;
            }

            // Fallback to group if needed (though usually elements inside have IDs due to normalizer)
            const groupTarget = target.closest('g[id]');
            if (groupTarget && groupTarget !== svgElement) {
                const id = groupTarget.getAttribute('id');
                selectElement(id);
                return;
            }

            selectElement(null);
        };

        svgElement.addEventListener('click', handleSvgClick);
        return () => {
            svgElement.removeEventListener('click', handleSvgClick);
        };
    }, [svgElement, selectElement]);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const content = e.target?.result as string;
                loadSVG(content);
            };
            reader.readAsText(file);
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleZoomIn = () => {
        setFitMode(false);
        setZoom(prev => clampZoom(prev * ZOOM_STEP));
    };

    const handleZoomOut = () => {
        setFitMode(false);
        setZoom(prev => clampZoom(prev / ZOOM_STEP));
    };

    const handleZoomFit = () => {
        const nextFit = computeFitZoom();
        setFitZoom(nextFit);
        setZoom(nextFit);
        setFitMode(true);
    };

    const handleWheelZoom = (event: React.WheelEvent<HTMLDivElement>) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        const direction = event.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
        setFitMode(false);
        setZoom(prev => clampZoom(prev * direction));
    };

    if (!svgDocument) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <Upload className="w-16 h-16 mx-auto text-slate-400 mb-4" />
                    <h2 className="text-xl font-semibold mb-2 text-slate-900">Import SVG</h2>
                    <p className="text-sm text-slate-500 mb-4">
                        Upload a generative SVG to begin refining
                    </p>
                    <div className="flex gap-2 justify-center">
                        <Button onClick={handleUploadClick}>
                            Choose File
                        </Button>
                    </div>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".svg,image/svg+xml"
                        className="hidden"
                        onChange={handleFileUpload}
                    />
                </div>
            </div>
        );
    }

    return (
        <div
            ref={viewportRef}
            className="relative h-full w-full overflow-auto"
            style={{ position: 'relative' }}
            onWheel={handleWheelZoom}
        >
            <div className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-md border bg-white/90 p-1 text-xs shadow-sm backdrop-blur">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleZoomOut}
                    title="Zoom out"
                    className="h-6 w-6 p-0"
                >
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <div className="min-w-[3.5rem] text-center tabular-nums text-slate-600 font-mono">
                    {Math.round(zoom * 100)}%
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleZoomIn}
                    title="Zoom in"
                    className="h-6 w-6 p-0"
                >
                    <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                    variant={fitMode ? 'default' : 'ghost'}
                    size="sm"
                    onClick={handleZoomFit}
                    title={`Zoom to fit (${Math.round(fitZoom * 100)}%)`}
                    className={`h-6 w-6 p-0 ${fitMode ? 'bg-slate-200 text-slate-900' : ''}`}
                >
                    <Maximize2 className="h-4 w-4" />
                </Button>
            </div>
            <div
                ref={svgContainerRef}
                className="flex items-center justify-center p-8 min-h-full bg-slate-100/80"
                style={{ position: 'relative' }}
            >
                <div
                    ref={canvasFrameRef}
                    className="relative inline-block bg-white shadow-[0_0_5px_rgba(0,0,0,0.1)] transition-all duration-75 ease-out"
                    style={
                        canvasSize
                            ? {
                                width: `${canvasSize.width * zoom}px`,
                                height: `${canvasSize.height * zoom}px`,
                            }
                            : undefined
                    }
                >
                    <div
                        id="canvas-stage"
                        ref={svgContentRef}
                        className="w-full h-full rounded-[0.15ex] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxNicgaGVpZ2h0PScxNic+PHJlY3Qgd2lkdGg9JzE2JyBoZWlnaHQ9JzE2JyBmaWxsPSd3aGl0ZScvPjxyZWN0IHg9JzAnIHk9JzAnIHdpZHRoPSc4JyBoZWlnaHQ9JzgnIGZpbGw9JyNmM2YzZjMnLz48cmVjdCB4PSc4JyB5PSc4JyB3aWR0aD0nOCcgaGVpZ2h0PSc4JyBmaWxsPScjZjNmM2YzJy8+PC9zdmc+')] shadow-[0_0_4px_rgba(0,0,0,0.05)]"
                    />
                    {svgElement && selectedElementId && (
                        <BoundingBox
                            key={refreshKey}
                            svgElement={svgElement}
                            elementId={selectedElementId}
                            containerElement={canvasFrameRef.current ?? svgElement}
                            onTransformComplete={() => setRefreshKey(prev => prev + 1)}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
