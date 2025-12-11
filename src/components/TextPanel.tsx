import React, { useMemo, useState } from 'react';

interface TextPanelProps {
    resultText: string;
    onLineClick: (lineIndex: number) => void;
}

const TextPanel: React.FC<TextPanelProps> = ({ resultText, onLineClick }) => {
    const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);

    // Optimize splitting for large documents
    const lines = useMemo(() => {
        if (!resultText) return [];
        return resultText.split('\n');
    }, [resultText]);

    const handleLineClick = (index: number) => {
        setSelectedLineIndex(index);
        onLineClick(index);
    };

    return (
        <div className="h-full overflow-y-auto border border-gray-200 rounded-md bg-white font-mono text-sm">
            {lines.length === 0 ? (
                <div className="p-4 text-gray-400 italic">No text content available.</div>
            ) : (
                <div className="divide-y divide-gray-100">
                    {lines.map((lineContent, index) => (
                        <div
                            key={index}
                            onClick={() => handleLineClick(index)}
                            className={`
                                flex cursor-pointer p-2 hover:bg-blue-50 transition-colors
                                ${selectedLineIndex === index ? 'bg-blue-100 border-l-4 border-blue-500' : 'border-l-4 border-transparent'}
                            `}
                        >
                            <span className="text-gray-400 select-none mr-3 w-8 text-right flex-shrink-0">
                                {index + 1}
                            </span>
                            <span className="whitespace-pre-wrap break-words text-gray-800">
                                {lineContent}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default TextPanel;
