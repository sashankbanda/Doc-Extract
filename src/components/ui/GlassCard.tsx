import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";

interface GlassCardProps extends HTMLMotionProps<"div"> {
  variant?: "default" | "elevated" | "interactive";
  glow?: boolean;
  glowColor?: "primary" | "secondary";
}

const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, variant = "default", glow = false, glowColor = "primary", children, ...props }, ref) => {
    const variants = {
      default: "glass",
      elevated: "glass surface-elevated",
      interactive: "glass glass-hover cursor-pointer",
    };

    const glowStyles = glow
      ? glowColor === "primary"
        ? "glow-primary-subtle"
        : "glow-secondary"
      : "";

    return (
      <motion.div
        ref={ref}
        className={cn(
          "rounded-2xl p-6",
          variants[variant],
          glowStyles,
          className
        )}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        {...props}
      >
        {children}
      </motion.div>
    );
  }
);

GlassCard.displayName = "GlassCard";

export { GlassCard };
