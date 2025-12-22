import { BoundingBox } from "@/types/document";
import { AnimatePresence, motion } from "framer-motion";

interface HighlightOverlayProps {
  highlights: BoundingBox[];
  activeHighlight?: BoundingBox | null;
  scale?: number;
  canvasWidth?: number;
  canvasHeight?: number;
}

export function HighlightOverlay({
  highlights,
  activeHighlight,
  scale = 1,
  canvasWidth,
  canvasHeight,
}: HighlightOverlayProps) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Passive highlights */}
      {highlights.map((highlight, index) => (
        <motion.div
          key={index}
          className="absolute rounded-sm"
          style={{
            left: highlight.x * scale,
            top: highlight.y * scale,
            width: highlight.width * scale,
            height: highlight.height * scale,
            backgroundColor: "hsl(var(--highlight-overlay) / 0.3)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
      ))}

      {/* Active highlight with glow animation */}
      <AnimatePresence>
        {activeHighlight && (
          <motion.div
            className="absolute rounded-sm"
            style={{
              left: activeHighlight.x * scale,
              top: activeHighlight.y * scale,
              width: activeHighlight.width * scale,
              height: activeHighlight.height * scale,
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3 }}
          >
            {/* Outer glow */}
            <motion.div
              className="absolute -inset-2 rounded-md blur-md"
              style={{
                backgroundColor: "hsl(var(--highlight-overlay) / 0.3)",
              }}
              animate={{
                opacity: [0.5, 0.8, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            {/* Inner highlight */}
            <div 
              className="absolute inset-0 rounded-sm border-2" 
              style={{
                backgroundColor: "hsl(var(--highlight-overlay) / 0.4)",
                borderColor: "hsl(var(--highlight-overlay))", 
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
