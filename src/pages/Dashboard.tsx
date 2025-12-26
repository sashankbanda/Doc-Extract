
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDocumentContext } from "@/context/DocumentContext";
import { CheckCircle, Clock, FileText, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// Types
interface DashboardStats {
  total: number;
  completed: number;
  in_progress: number;
  pending: number;
}

interface FileItem {
  id: string; // hash
  filename: string;
  status: string;
  hash: string;
}

interface DashboardData {
  stats: DashboardStats;
  files: FileItem[];
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { documents, removeDocument } = useDocumentContext();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<{id: string, name: string} | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Direct fetch or via api helper? 
      // api helper might not have this endpoint yet. 
      // I'll assume I can just fetch from backend directly for now or add to api.ts later.
      const res = await fetch("http://localhost:8005/dashboard/files");
      if (!res.ok) throw new Error("Failed to fetch dashboard data");
      const jsonData = await res.json();
      setData(jsonData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (status: string) => {
    // Normalize status: lowercase and handle potential spaces vs underscores
    const key = status.toLowerCase().replace(/_/g, " ");
    
    switch (key) {
      case "completed": return "bg-green-100 text-green-800 hover:bg-green-200 border-green-200 border";
      case "in progress": return "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200 border";
      // fast text match for pending or anything else
      case "pending": return "bg-red-100 text-red-800 hover:bg-red-200 border-red-200 border"; 
      default: return "bg-red-100 text-red-800 hover:bg-red-200 border-red-200 border";
    }
  };

  const handleDeleteClick = (file: FileItem) => {
    setFileToDelete({ id: file.hash, name: file.filename });
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!fileToDelete) return;
    try {
        // 1. Delete from Backend
        await fetch(`http://localhost:8005/dashboard/files/${fileToDelete.id}`, { method: 'DELETE' });
        
        // 2. Delete from Client Context (Syncs dropdowns/workspace)
        // Find document by whisperHash (which is fileToDelete.id)
        const docToRemove = documents.find(d => d.whisperHash === fileToDelete.id);
        if (docToRemove) {
            removeDocument(docToRemove.id);
        }

        // 3. Refresh Dashboard Data
        fetchDashboardData();
    } catch (e) {
        console.error("Failed to delete file", e);
    } finally {
        setDeleteOpen(false);
        setFileToDelete(null);
    }
  };

  const handleCreateNew = () => {
    navigate("/upload");
  };
  
  const handleView = (hash: string, filename: string) => {
      navigate(`/workspace?whisper_hash=${hash}&fileName=${encodeURIComponent(filename)}`);
  };

  if (loading) {
    return <div className="p-8">Loading dashboard...</div>;
  }

  if (!data) {
    return <div className="p-8">Failed to load data.</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Button onClick={handleCreateNew}>Upload New File</Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Files</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.stats.completed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.stats.in_progress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <FileText className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.stats.pending}</div>
          </CardContent>
        </Card>
      </div>

      {/* Files Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filename</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.files.map((file) => (
              <TableRow key={file.id}>
                <TableCell className="font-medium">{file.filename}</TableCell>
                <TableCell>
                  <Badge className={statusColor(file.status)}>{file.status}</Badge>
                </TableCell>
                <TableCell className="text-right space-x-2">
                   {file.status.toLowerCase() === 'completed' && (
                       <Button variant="outline" size="sm" onClick={() => window.open(`http://localhost:8005/export/download/${file.hash}`, '_blank')}>
                           Export JSON
                       </Button>
                   )}
                   <Button variant="secondary" size="sm" onClick={() => handleView(file.hash, file.filename)}>
                       Open
                   </Button>
                   <Button variant="ghost" size="icon" className="hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteClick(file)}>
                       <Trash2 className="w-4 h-4" />
                   </Button>
                </TableCell>
              </TableRow>
            ))}
            {data.files.length === 0 && (
                <TableRow>
                    <TableCell colSpan={3} className="text-center h-24 text-muted-foreground">
                        No files found. Start by uploading a document.
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{fileToDelete?.name}"? This action cannot be undone and will remove the file from your dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
             <AlertDialogCancel>Cancel</AlertDialogCancel>
             <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
               Delete
             </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
