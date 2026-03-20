import { motion, useReducedMotion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { features } from "./data";

export function FeaturesSection() {
  const prefersReducedMotion = useReducedMotion() ?? false;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: prefersReducedMotion ? 0 : 0.5 } },
  };

  return (
    <section id="features" className="py-20 md:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.6 }}
          className="text-center mb-16"
        >
          <Badge variant="outline" className="mb-4">核心功能</Badge>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">为现代教学而生</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">强大的功能组合，让课件创作变得简单高效</p>
        </motion.div>

        <motion.div variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => (
            <motion.div key={feature.title} variants={itemVariants}>
              <Card className="h-full group hover:shadow-lg transition-all duration-300 border-border/50 hover:border-border overflow-hidden">
                <CardHeader className="p-6">
                  <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.color} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className="h-6 w-6 text-white" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
