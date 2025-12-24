import { ModeToggle } from "@/components/mode-toggle";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useDocumentContext } from "@/context/DocumentContext";
import { apiResetSession } from "@/lib/api";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { FileText, Layers, RotateCcw, Settings, Upload } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ComparisonSettings } from "./workspace/ComparisonSettings";

const navItems = [
  { href: "/", label: "Home", icon: FileText },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/workspace", label: "Workspace", icon: Layers },
];

export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { clearDocuments } = useDocumentContext();

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50"
    >
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center glow-primary-subtle">
            <FileText className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
            DocExtract
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300",
                  "flex items-center gap-2",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <item.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/30"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                  />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
            <Dialog>
                <DialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hover:bg-muted/50">
                        <Settings className="w-5 h-5" />
                    </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Settings</DialogTitle>
                        <DialogDescription>
                            Configure application settings, models, and sessions.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-6 py-4">
                        {/* Comparison Settings Section */}
                        <Accordion type="single" collapsible defaultValue="comparison-models" className="w-full">
                            <AccordionItem value="comparison-models" className="border-b">
                                <AccordionTrigger className="hover:no-underline py-2">
                                     <h3 className="text-sm font-medium">Comparison & Models</h3>
                                </AccordionTrigger>
                                <AccordionContent className="p-1">
                                    <ComparisonSettings />
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>

                        {/* Appearance & Session Section */}
                        <div className="space-y-4">
                             <h3 className="text-sm font-medium border-b pb-2">Appearance & Session</h3>
                             <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <h4 className="text-sm font-medium">Appearance</h4>
                                    <p className="text-xs text-muted-foreground">Toggle light/dark mode</p>
                                </div>
                                <ModeToggle />
                             </div>
                             
                             <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <h4 className="text-sm font-medium text-destructive">Reset Session</h4>
                                    <p className="text-xs text-muted-foreground">Clear all data and start over</p>
                                </div>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="destructive"
                                      size="sm"
                                    >
                                      <RotateCcw className="w-4 h-4 mr-2" />
                                      Reset
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Reset Session</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to reset the session? This will clear all uploaded files and their extracted data. This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={async () => {
                                          try {
                                            await apiResetSession();
                                            clearDocuments();
                                            navigate("/upload");
                                          } catch (err) {
                                            console.error("Failed to reset session:", err);
                                            clearDocuments();
                                            navigate("/upload");
                                          }
                                        }}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Reset Session
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                             </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
      </div>
    </motion.header>
  );
}
