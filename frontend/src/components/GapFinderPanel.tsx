import { motion } from 'framer-motion';

interface Props {
  q1Answer: string;
  q2Answer: string;
  q3Answer: string;
  q4Answer: string;
  isLoading?: boolean;
}

export default function GapFinderPanel({ q1Answer, q2Answer, q3Answer, q4Answer, isLoading = false }: Props) {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.3 }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } }
  };

  const questions = [
    { title: "What gaps are there in my knowledge?", answer: q1Answer },
    { title: "What do you think I don't know about?", answer: q2Answer },
    { title: "Where am I going wrong?", answer: q3Answer },
    { title: "Where am I going wrong in my reasoning?", answer: q4Answer },
  ];

  return (
    <div className="bg-white rounded-[12px] border border-gray-200 shadow-sm overflow-hidden flex flex-col font-sans">
      {/* Title Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
        <div className="flex space-x-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-gray-300"></div>
          <div className="w-3 h-3 rounded-full bg-gray-300"></div>
        </div>
        <div className="bg-[#FFC107] text-black font-bold text-xs px-[10px] py-[2px] rounded-[6px] tracking-wide">
          Gap Finder
        </div>
        <div className="w-12"></div> {/* Spacer for balance */}
      </div>

      {/* Content */}
      <div className="p-6">
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-4">
          {questions.map((q, idx) => (
            <motion.div key={idx} variants={item} className="bg-white rounded-[8px] border-2 border-red-500 py-[10px] px-[16px] shadow-sm">
              <h4 className="text-black font-bold text-[14px] mb-2">{q.title}</h4>
              {isLoading ? (
                <div className="animate-pulse flex space-x-4">
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-2 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-2 bg-gray-200 rounded w-5/6"></div>
                  </div>
                </div>
              ) : (
                <p className="text-[#6b7280] text-[12px] leading-relaxed">
                  {q.answer || "No response generated."}
                </p>
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
