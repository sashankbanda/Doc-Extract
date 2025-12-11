import React, { useEffect, useState } from 'react';
import DocumentWorkspace from './DocumentWorkspace';

const API_BASE = "http://localhost:8005";

interface JobHistoryItem {
    whisperHash: string;
    fileName: string;
    timestamp: number;
}

const UploadAndProcess: React.FC = () => {
    // State
    const [file, setFile] = useState<File | null>(null);
    const [whisperHash, setWhisperHash] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const [history, setHistory] = useState<JobHistoryItem[]>([]);
    const [error, setError] = useState<string | null>(null);

    // 1. Load History on Mount
    useEffect(() => {
        const jobs: JobHistoryItem[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("job_")) {
                try {
                    const item = JSON.parse(localStorage.getItem(key) || "");
                    jobs.push(item);
                } catch (e) {
                    console.error("Error parsing job history", key, e);
                }
            }
        }
        // Sort by timestamp desc
        jobs.sort((a, b) => b.timestamp - a.timestamp);
        setHistory(jobs);
    }, []);

    // 2. Polling Logic
    useEffect(() => {
        let intervalId: any;

        const checkStatus = async () => {
             if (!whisperHash) return;

             try {
                 const res = await fetch(`${API_BASE}/status?whisper_hash=${whisperHash}`);
                 if (res.ok) {
                     const data = await res.json();
                     // status: 'processing' | 'processed' | 'error'
                     setStatus(data.status);
                     
                     if (data.status === 'processed') {
                         setLoading(false);
                         clearInterval(intervalId);
                     } else if (data.status === 'error') {
                         setError("Processing failed on server.");
                         setLoading(false);
                         clearInterval(intervalId);
                     }
                 }
             } catch (err) {
                 console.error("Polling error:", err);
             }
        };

        if (whisperHash && status !== 'processed' && status !== 'error') {
            setLoading(true);
            checkStatus(); // Initial check
            intervalId = setInterval(checkStatus, 2000);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [whisperHash, status]);

    // 3. Handle Upload
    const handleUpload = async () => {
        if (!file) return;

        setLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch(`${API_BASE}/upload`, {
                method: "POST",
                body: formData
            });

            if (!res.ok) throw new Error("Upload failed");

            const data = await res.json();
            const hash = data.whisper_hash;
            
            setWhisperHash(hash);
            setStatus("processing"); // Start polling locally

            // Save to history
            const jobItem: JobHistoryItem = {
                whisperHash: hash,
                fileName: file.name,
                timestamp: Date.now()
            };
            localStorage.setItem(`job_${hash}`, JSON.stringify(jobItem));
            setHistory(prev => [jobItem, ...prev]);

        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

    // 4. Resume Job
    const handleResume = (hash: string) => {
        setWhisperHash(hash);
        setStatus("unknown"); // Will trigger polling to find out real status (or processed)
    };

    const handleClearHistory = () => {
        // Clear local storage
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith("job_")) localStorage.removeItem(key);
        });
        setHistory([]);
    };

    // --- Render: Workspace if processed ---
    if (status === 'processed' && whisperHash) {
        return <DocumentWorkspace whisperHash={whisperHash} />;
    }

    // --- Render: Upload UI ---
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 font-sans">
            <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
                <h1 className="text-2xl font-bold mb-6 text-gray-800 text-center">LLMWhisperer Processor</h1>

                {/* File Input */}
                <div className="mb-6">
                    <label className="block mb-2 text-sm font-medium text-gray-700">Select Document</label>
                    <input 
                        type="file" 
                        onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
                        className="block w-full text-sm text-gray-500
                            file:mr-4 file:py-2 file:px-4
                            file:rounded-full file:border-0
                            file:text-sm file:font-semibold
                            file:bg-blue-50 file:text-blue-700
                            hover:file:bg-blue-100"
                    />
                </div>

                {/* Upload Button */}
                <button 
                    onClick={handleUpload}
                    disabled={!file || loading}
                    className={`w-full py-2 px-4 rounded-md text-white font-medium transition-colors
                        ${!file || loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}
                    `}
                >
                    {loading ? "Processing..." : "Upload & Process"}
                </button>

                {error && (
                    <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
                        {error}
                    </div>
                )}

                {loading && (
                    <div className="mt-6 flex flex-col items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                        <p className="text-gray-600 text-sm">
                            {status === 'processing' ? 'Processing on Server...' : 'Uploading...'}
                        </p>
                    </div>
                )}

                <hr className="my-8 border-gray-200" />

                {/* History Section */}
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold text-gray-700">Recent Jobs</h2>
                        {history.length > 0 && (
                            <button 
                                onClick={handleClearHistory}
                                className="text-xs text-red-500 hover:underline"
                            >
                                Clear History
                            </button>
                        )}
                    </div>
                    
                    {history.length === 0 ? (
                        <p className="text-gray-400 text-sm italic">No recent jobs found.</p>
                    ) : (
                        <ul className="space-y-2 max-h-60 overflow-y-auto">
                            {history.map((job) => (
                                <li key={job.whisperHash} className="flex justify-between items-center p-3 bg-gray-50 rounded hover:bg-gray-100">
                                    <div className="overflow-hidden">
                                        <p className="text-sm font-medium text-gray-800 truncate">{job.fileName}</p>
                                        <p className="text-xs text-gray-500 truncate">{new Date(job.timestamp).toLocaleString()}</p>
                                    </div>
                                    <button 
                                        onClick={() => handleResume(job.whisperHash)}
                                        className="ml-4 text-sm text-blue-600 hover:underline shrink-0"
                                    >
                                        Resume
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

export default UploadAndProcess;
