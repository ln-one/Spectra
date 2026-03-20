import { motion, useReducedMotion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { steps } from "./data";

export function WorkflowSection() {
  const prefersReducedMotion = useReducedMotion() ?? false;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.15 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: prefersReducedMotion ? 0 : 0.5 } },
  };

  return (
    <section id="workflow" className="py-20 md:py-32 bg-gradient-to-b from-muted/50 to-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: prefersReducedMotion ? 0 : 0.6 }} className="text-center mb-16">
          <Badge variant="outline" className="mb-4">工作流程</Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">简单四步，完成课件创作</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">从想法到成品，从未如此简单</p>
        </motion.div>

        <motion.div variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} className="relative">
          <div className="hidden lg:block absolute top-20 left-1/4 right-1/4 h-px bg-gradient-to-r from-primary/0 via-primary/30 to-primary/0" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step) => (
              <motion.div key={step.number} variants={itemVariants} className="relative">
                <div className="text-center">
                  <div className="relative inline-flex mb-6">
                    <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-xl">
                      <step.icon className="h-8 w-8 text-primary-foreground" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-background border-2 border-primary flex items-center justify-center text-xs font-bold">
                      {step.number}
                    </div>
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
