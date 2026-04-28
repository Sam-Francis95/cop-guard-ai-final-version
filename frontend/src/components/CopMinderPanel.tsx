import { motion } from 'framer-motion';
import { BrainCircuit, Info, AlertTriangle, AlertOctagon } from 'lucide-react';

export default function CopMinderPanel({ analysis }: { analysis: any }) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.5 } // 0.5s delayed reveal sequence!
    }
  };

  const item = {
    hidden: { opacity: 0, x: -20 },
    show: { opacity: 1, x: 0, transition: { type: "spring" as const, bounce: 0.4 } }
  };

  const questions = [
    {
      id: 'q1',
      title: "Q1. What gaps are there in my coverage about this claim?",
      answer: analysis.q1_answer,
      icon: <Info className="text-blue-400 w-5 h-5 mr-3 mt-1 flex-shrink-0" />
    },
    {
      id: 'q2',
      title: "Q2. What do I think this worker does not know I can detect?",
      answer: analysis.q2_answer,
      icon: <BrainCircuit className="text-purple-400 w-5 h-5 mr-3 mt-1 flex-shrink-0" />
    },
    {
      id: 'q3',
      title: "Q3. Where am I going wrong in my detections?",
      answer: analysis.q3_answer,
      icon: <AlertTriangle className="text-yellow-400 w-5 h-5 mr-3 mt-1 flex-shrink-0" />
    },
    {
      id: 'q4',
      title: "Q4. Where am I going wrong in my reasoning?",
      answer: analysis.q4_answer,
      icon: <AlertOctagon className="text-orange-400 w-5 h-5 mr-3 mt-1 flex-shrink-0" />
    }
  ];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-purple-500 to-indigo-600"></div>
      
      <div className="flex items-center mb-6 border-b border-gray-800 pb-4">
        <BrainCircuit className="w-8 h-8 text-indigo-400 mr-4" />
        <div>
          <h2 className="text-xl font-bold text-white tracking-wide">Cop Minder AI Engine</h2>
          <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">Self-Interrogation Protocol Active</p>
        </div>
      </div>

      <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
        {questions.map((q) => (
          <motion.div key={q.id} variants={item} className="bg-gray-950 rounded-lg p-5 border border-gray-800 shadow-inner">
             <h3 className="text-sm font-semibold text-gray-300 mb-2">{q.title}</h3>
             <div className="flex items-start">
               {q.icon}
               <p className="text-gray-100 font-medium leading-relaxed">{q.answer}</p>
             </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Adding an extra half-second delay to the summary, so it shows after Q4 */}
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        transition={{ delay: 2.2 }}
        className="mt-6 pt-5 border-t border-gray-800"
      >
         <p className="text-sm text-gray-400 font-mono leading-relaxed"><span className="text-blue-400 font-bold tracking-widest uppercase">Reasoning Summary: </span> {analysis.reasoning_summary}</p>
      </motion.div>
    </div>
  );
}
