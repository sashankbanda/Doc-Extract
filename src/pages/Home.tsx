import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { GlassButton } from "@/components/ui/GlassButton";
import { ArrowRight, Sparkles, FileSearch, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden px-6">
      {/* Background Effects */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Primary glow orb */}
        <motion.div
          className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-primary/20 blur-[120px]"
          animate={{
            x: [0, 50, 0],
            y: [0, -30, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        {/* Secondary glow orb */}
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-secondary/15 blur-[100px]"
          animate={{
            x: [0, -40, 0],
            y: [0, 40, 0],
            scale: [1, 1.15, 1],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px]" />
      </div>

      {/* Content */}
      <motion.div
        className="relative z-10 text-center max-w-4xl mx-auto"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass mb-8"
        >
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm text-muted-foreground">AI-Powered Document Intelligence</span>
        </motion.div>

        {/* Main Heading */}
        <motion.h1
          className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 tracking-tight"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <span className="text-foreground">Extract.</span>{" "}
          <span className="text-gradient animate-gradient">Analyze.</span>{" "}
          <span className="text-foreground">Understand.</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          Transform your documents into structured, actionable data with precision highlighting 
          and intelligent field extraction.
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Link to="/upload">
            <GlassButton variant="primary" size="lg" className="min-w-[200px]">
              Get Started
              <ArrowRight className="w-5 h-5" />
            </GlassButton>
          </Link>
          <Link to="/workspace">
            <GlassButton variant="default" size="lg" className="min-w-[200px]">
              View Demo
            </GlassButton>
          </Link>
        </motion.div>

        {/* Feature Pills */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-3 mt-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          {[
            { icon: FileSearch, label: "Layout Extraction" },
            { icon: Zap, label: "Instant Processing" },
            { icon: Sparkles, label: "Smart Highlights" },
          ].map((feature, index) => (
            <motion.div
              key={feature.label}
              className="flex items-center gap-2 px-4 py-2 rounded-xl glass text-sm text-muted-foreground"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 + index * 0.1 }}
            >
              <feature.icon className="w-4 h-4 text-primary" />
              {feature.label}
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
}
