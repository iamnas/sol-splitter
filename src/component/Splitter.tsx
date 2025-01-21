import React, { useState, useCallback } from 'react';

import {
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
  TransactionMessage,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { Upload, Send, X, RefreshCw } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { useAppKitConnection, type Provider } from '@reown/appkit-adapter-solana/react';
import { useAppKitAccount, useAppKitProvider } from '@reown/appkit/react';

interface Recipient {
  address: string;
  amount: number;
}


import { motion, AnimatePresence } from 'framer-motion';

export default function Splitter() {

  const { connection } = useAppKitConnection()

  const { address: publicKey } = useAppKitAccount()

  const { walletProvider } = useAppKitProvider<Provider>('solana')



  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: "easeOut",
        staggerChildren: 0.1
      }
    },
    exit: {
      opacity: 0,
      y: -20,
      transition: {
        duration: 0.4,
        ease: "easeIn"
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.4,
        ease: "easeOut"
      }
    },
    exit: {
      opacity: 0,
      x: 20,
      transition: {
        duration: 0.3,
        ease: "easeIn"
      }
    }
  };

  const buttonVariants = {
    hover: {
      scale: 1.05,
      transition: {
        duration: 0.2,
        ease: "easeInOut"
      }
    },
    tap: {
      scale: 0.95
    }
  };


  const [recipients, setRecipients] = useState<Recipient[]>([
    { address: '', amount: 0 },
  ]);
  const [isProcessing, setIsProcessing] = useState(false);

  const validateSolanaAddress = useCallback((address: string): boolean => {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }, []);

  const validateAddress = useCallback((address: string): boolean => {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }, []);

  const parseFileContent = useCallback((content: string): Recipient[] => {
    const lines = content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) {
      throw new Error('File is empty');
    }

    const startIndex = lines[0].toLowerCase().includes('address') ? 1 : 0;

    if (lines.length <= startIndex) {
      throw new Error('No data found in file after header');
    }

    return lines.slice(startIndex).map((line, index) => {
      try {
        const [address, amountStr] = line.split(',').map(part => part.trim());

        if (!address || !amountStr) {
          throw new Error(
            `Invalid line format. Found: "${line}". Expected format: "address,amount"`
          );
        }

        const amount = parseFloat(amountStr);

        if (isNaN(amount)) {
          throw new Error(
            `Invalid amount "${amountStr}" at line ${index + startIndex + 1}`
          );
        }

        if (amount <= 0) {
          throw new Error(
            `Amount must be greater than 0. Found ${amount} at line ${index + startIndex + 1}`
          );
        }

        let solanaAddress = address;
        if (address.startsWith('0x')) {
          try {
            solanaAddress = new PublicKey(address.slice(2)).toString();
          } catch {
            throw new Error(
              `Invalid address format: "${address}". Please provide a valid Solana address.`
            );
          }
        }

        if (!validateAddress(solanaAddress)) {
          throw new Error(
            `Invalid Solana address: "${solanaAddress}"`
          );
        }

        return {
          address: solanaAddress,
          amount
        };
      } catch (error) {
        const lineNumber = index + startIndex + 1;
        throw new Error(
          `Error at line ${lineNumber}: "${line}". ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }, [validateAddress]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      toast.error('No file selected');
      return;
    }

    if (!selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.txt')) {
      toast.error('Please upload a CSV or TXT file');
      return;
    }

    try {
      const content = await selectedFile.text();
      const newRecipients = parseFileContent(content);
      setRecipients(newRecipients);
      toast.success(`Successfully loaded ${newRecipients.length} recipients`);
    } catch (error) {
      console.error('Error parsing file:', error);
      setRecipients([{ address: '', amount: 0 }]);
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Error parsing file');
      }
    }
  };

  const addRecipient = () => {
    setRecipients([...recipients, { address: '', amount: 0 }]);
  };

  const removeRecipient = (index: number) => {
    const newRecipients = recipients.filter((_, i) => i !== index);
    setRecipients(newRecipients.length ? newRecipients : [{ address: '', amount: 0 }]);
    toast.success('Recipient removed');
  };

  const clearAllRecipients = () => {
    setRecipients([{ address: '', amount: 0 }]);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
    toast.success('All recipients cleared');
  };

  const updateRecipient = (index: number, field: 'address' | 'amount', value: string) => {
    const newRecipients = [...recipients];
    newRecipients[index] = {
      ...newRecipients[index],
      [field]: field === 'amount' ? parseFloat(value) || 0 : value
    };
    setRecipients(newRecipients);
  };


  const handleSend = async () => {
    if (!publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }


    setIsProcessing(true);

    try {




      const signature = await sendTransaction();
      toast.success(`Transaction successful! 🎉 TX: ${signature}`);
      clearAllRecipients();
    } catch (error) {
      if (error instanceof Error && error?.message.includes('block height exceeded')) {
        console.log('Retrying transaction with a new blockhash...');
        try {
          const signature = await sendTransaction();
          toast.success(`Transaction successful! 🎉 TX: ${signature}`);
        } catch (retryError) {
          toast.error(retryError instanceof Error ? retryError.message : 'Retry failed');
        }
      } else {
        console.error('Error:', error);
        toast.error(error instanceof Error ? error.message : 'Transaction failed');
      }
    } finally {
      setIsProcessing(false);
      clearAllRecipients();
    }
  };

  const sendTransaction = async () => {
    if (!connection) {
      throw new Error('Connection is not available');
    }
    if (!publicKey) {
      toast.error('Please connect your wallet first');
      return;
    }

    const validRecipients = recipients.filter(({ address, amount }) => {
      return address && amount > 0 && validateSolanaAddress(address);
    });

    if (validRecipients.length === 0) {
      toast.error('Please add at least one valid recipient');
      return;
    }
    const totalAmount = validRecipients.reduce((sum, { amount }) => sum + amount, 0);
    const balance = await connection?.getBalance(new PublicKey(publicKey));
    if (balance && balance < totalAmount * LAMPORTS_PER_SOL) {
      throw new Error('Insufficient balance');
    }


    const instructions = [
      ComputeBudgetProgram.setComputeUnitLimit({
        units: Math.min(200000 * validRecipients.length, 1_400_000),
      }),
    ];

    validRecipients.forEach(({ address, amount }) => {
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(publicKey),
          toPubkey: new PublicKey(address),
          lamports: amount * LAMPORTS_PER_SOL,
        })
      );
    });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
      payerKey: new PublicKey(publicKey),
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);

    const signature = await walletProvider.sendTransaction(transaction, connection);

    await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      'finalized'
    );

    return signature;
  };

  // const handleSend = async () => {
  //   if (!publicKey) {
  //     toast.error('Please connect your wallet first');
  //     return;
  //   }

  //   const validRecipients = recipients.filter(({ address, amount }) => {
  //     return address && amount > 0 && validateSolanaAddress(address);
  //   });

  //   if (validRecipients.length === 0) {
  //     toast.error('Please add at least one valid recipient');
  //     return;
  //   }

  //   setIsProcessing(true);

  //   try {
  //     const totalAmount = validRecipients.reduce((sum, { amount }) => sum + amount, 0);



  //     const balance = await connection?.getBalance(new PublicKey(publicKey));
  //     if (balance && balance < totalAmount * LAMPORTS_PER_SOL) {
  //       throw new Error('Insufficient balance');
  //     }

  //     const instructions = [
  //       ComputeBudgetProgram.setComputeUnitLimit({
  //         units: 200000 * validRecipients.length
  //       })
  //     ];

  //     validRecipients.forEach(({ address, amount }) => {
  //       instructions.push(
  //         SystemProgram.transfer({
  //           fromPubkey: new PublicKey(publicKey),
  //           toPubkey: new PublicKey(address),
  //           lamports: amount * LAMPORTS_PER_SOL
  //         })
  //       );
  //     });

  //     if (!connection) {
  //       throw new Error('Connection is not available');
  //     }
  //     const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  //     const messageV0 = new TransactionMessage({
  //       payerKey: new PublicKey(publicKey),
  //       recentBlockhash: blockhash,
  //       instructions
  //     }).compileToV0Message();

  //     const transaction = new VersionedTransaction(messageV0);

  //     const signature = await walletProvider.sendTransaction(transaction, connection);

  //     // const confirmation = 
  //     await connection.confirmTransaction({
  //       signature,
  //       blockhash,
  //       lastValidBlockHeight,
  //     },'finalized');

  //     // if (confirmation.value.err) {
  //     //   throw new Error('Transaction failed');
  //     // }
  //     toast.success('Transaction successful! 🎉');
  //     clearAllRecipients();
  //   } catch (error) {
  //     console.error('Error:', error);

  //     toast.error(error instanceof Error ? error.message : 'Transaction failed');
  //   } finally {
  //     setIsProcessing(false);
  //     clearAllRecipients();
  //   }
  // };


  return (
    <div className="min-h-screen bg-[#0D1117] p-8 relative overflow-hidden content-center">
      {/* Enhanced animated gradient orbs */}
      <motion.div
        className="absolute inset-0 overflow-hidden"
        animate={{
          scale: [1, 1.1, 1],
          rotate: [0, 5, -5, 0],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          repeatType: "reverse",
        }}
      >
        <motion.div
          className="absolute top-0 left-0 w-[600px] h-[600px] bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-full filter blur-[150px] opacity-40"
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            repeatType: "reverse",
          }}
        />
        <motion.div
          className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-gradient-to-r from-cyan-400 to-blue-600 rounded-full filter blur-[150px] opacity-40"
          animate={{
            x: [0, -50, 0],
            y: [0, -30, 0],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            repeatType: "reverse",
          }}
        />
      </motion.div>

      <motion.div
        className="max-w-4xl mx-auto relative"
        initial="hidden"
        animate="visible"
        variants={containerVariants}
      >
        <motion.div
          className="relative backdrop-blur-2xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl p-8 shadow-2xl border border-white/20 overflow-hidden"
          whileHover={{ boxShadow: "0 0 40px rgba(255,255,255,0.1)" }}
          transition={{ duration: 0.3 }}
        >
          <motion.h1
            className="text-5xl font-bold text-center mb-8"
            variants={itemVariants}
          >
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-500 to-cyan-500 drop-shadow-[0_0_25px_rgba(255,0,255,0.5)]">
              SOL Splitter
            </span>
          </motion.h1>

          <motion.div
            className="flex justify-center mb-8"
            variants={itemVariants}
          >
            <appkit-button balance='hide' />
          </motion.div>

          <AnimatePresence mode="wait">
            {publicKey && (
              <motion.div
                key="content"
                initial="hidden"
                animate="visible"
                exit="exit"
                variants={containerVariants}
              >
                <motion.div className="mb-8" variants={itemVariants}>
                  <div className="flex items-center justify-center space-x-4 flex-wrap gap-4">
                    <motion.label
                      className="relative cursor-pointer"
                      variants={buttonVariants}
                      whileHover="hover"
                      whileTap="tap"
                    >
                      <input
                        type="file"
                        className="hidden"
                        accept=".csv,.txt"
                        onChange={handleFileUpload}
                        onClick={(e) => {
                          (e.target as HTMLInputElement).value = '';
                        }}
                      />
                      <div className="flex items-center space-x-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white px-6 py-3 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-fuchsia-500/25 border border-white/20 backdrop-blur-sm">
                        <Upload size={20} />
                        <span>Upload CSV</span>
                      </div>
                    </motion.label>

                    {/* ... Other buttons with similar motion components ... */}

                    <span className="text-white/80">or</span>
                    <button
                      onClick={addRecipient}
                      className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-3 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/25 border border-white/20 backdrop-blur-sm"
                    >
                      Add Recipient
                    </button>
                    <button
                      onClick={clearAllRecipients}
                      className="flex items-center space-x-2 bg-gradient-to-r from-rose-500 to-red-600 text-white px-6 py-3 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-rose-500/25 border border-white/20 backdrop-blur-sm"
                    >
                      <RefreshCw size={20} />
                      <span>Clear All</span>
                    </button>

                  </div>
                </motion.div>

                <motion.div className="space-y-4 mb-8">
                  <AnimatePresence>
                    {recipients.map((recipient, index) => (
                      <motion.div
                        key={index}
                        variants={itemVariants}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        className="flex space-x-4 group"
                      >
                        {/* ... Input fields ... */}
                        <input
                          type="text"
                          placeholder="Recipient Address"
                          value={recipient.address}
                          onChange={(e) => updateRecipient(index, 'address', e.target.value)}
                          className="flex-1 bg-black/20 backdrop-blur-xl border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:border-fuchsia-500/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 transition-all"
                        />
                        <input
                          type="number"
                          placeholder="Amount in SOL"
                          value={recipient.amount || ''}
                          onChange={(e) => updateRecipient(index, 'amount', e.target.value)}
                          min="0"
                          step="0.000000001"
                          className="w-40 bg-black/20 backdrop-blur-xl border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
                        />
                        <button
                          onClick={() => removeRecipient(index)}
                          className="p-3 text-white/50 hover:text-rose-500 transition-colors backdrop-blur-xl rounded-xl hover:bg-white/5 border border-white/20"
                          title="Remove recipient"
                        >
                          <X size={20} />
                        </button>


                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>

                <motion.div
                  className="flex justify-center"
                  variants={itemVariants}
                >
                  <motion.button
                    onClick={handleSend}
                    disabled={isProcessing}
                    variants={buttonVariants}
                    whileHover="hover"
                    whileTap="tap"
                    className={`flex items-center space-x-2 px-8 py-4 rounded-xl transition-all duration-300 shadow-lg border border-white/20 ${isProcessing
                      ? 'bg-gray-600/80 cursor-not-allowed'
                      : 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:shadow-lg hover:shadow-emerald-500/25'
                      } text-white backdrop-blur-xl`}
                  >
                    <Send size={20} />
                    <span>{isProcessing ? 'Processing...' : 'Send SOL'}</span>
                  </motion.button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>

      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'rgba(13, 17, 23, 0.9)',
            backdropFilter: 'blur(16px)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '12px',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
          },
          success: {
            iconTheme: {
              primary: '#10B981',
              secondary: 'white',
            },
          },
          error: {
            iconTheme: {
              primary: '#F43F5E',
              secondary: 'white',
            },
          },
        }}
      />
    </div>
  );

  // return (
  //   <div className="min-h-screen bg-[#0D1117] p-8 relative overflow-hidden content-center">
  //     {/* Enhanced gradient orbs with more vibrant colors */}
  //     <div className="absolute inset-0 overflow-hidden">
  //       <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-full filter blur-[150px] opacity-40 animate-pulse"></div>
  //       <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-gradient-to-r from-cyan-400 to-blue-600 rounded-full filter blur-[150px] opacity-40 animate-pulse delay-700"></div>
  //       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-gradient-to-r from-fuchsia-500 to-cyan-500 rounded-full filter blur-[150px] opacity-30 animate-pulse delay-1000"></div>
  //     </div>

  //     <div className="max-w-4xl mx-auto relative ">
  //       {/* Enhanced glassy card with more depth and sophisticated lighting effects */}
  //       <div className="relative backdrop-blur-2xl bg-gradient-to-br from-white/10 to-white/5 rounded-3xl p-8 shadow-2xl border border-white/20 overflow-hidden">
  //         {/* Refined geometric accents with subtle gradients */}
  //         <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-fuchsia-500/10 to-transparent rotate-45 transform origin-top-left"></div>
  //         <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-cyan-500/10 to-transparent -rotate-45 transform origin-bottom-right"></div>

  //         {/* Inner glow effect */}
  //         <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-white/5 via-transparent to-white/5"></div>

  //         {/* Content container with enhanced depth */}
  //         <div className="relative z-10">
  //           <h1 className="text-5xl font-bold text-center mb-8">
  //             <span className="bg-clip-text text-transparent bg-gradient-to-r from-fuchsia-500 to-cyan-500 drop-shadow-[0_0_25px_rgba(255,0,255,0.5)]">
  //               SOL Splitter
  //             </span>
  //           </h1>

  //           <div className="flex justify-center mb-8">
  //             <appkit-button balance='hide' />
  //           </div>

  //           {publicKey && (
  //             <>
  //               <div className="mb-8">
  //                 <div className="flex items-center justify-center space-x-4 flex-wrap gap-4">
  //                   <label className="relative cursor-pointer">
  //                     <input
  //                       type="file"
  //                       className="hidden"
  //                       accept=".csv,.txt"
  //                       onChange={handleFileUpload}
  //                       onClick={(e) => {
  //                         (e.target as HTMLInputElement).value = '';
  //                       }}
  //                     />
  //                     <div className="flex items-center space-x-2 bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white px-6 py-3 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-fuchsia-500/25 border border-white/20 backdrop-blur-sm">
  //                       <Upload size={20} />
  //                       <span>Upload CSV</span>
  //                     </div>
  //                   </label>
  // <span className="text-white/80">or</span>
  // <button
  //   onClick={addRecipient}
  //   className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-3 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-cyan-500/25 border border-white/20 backdrop-blur-sm"
  // >
  //   Add Recipient
  // </button>
  // <button
  //   onClick={clearAllRecipients}
  //   className="flex items-center space-x-2 bg-gradient-to-r from-rose-500 to-red-600 text-white px-6 py-3 rounded-xl transition-all duration-300 hover:shadow-lg hover:shadow-rose-500/25 border border-white/20 backdrop-blur-sm"
  // >
  //   <RefreshCw size={20} />
  //   <span>Clear All</span>
  // </button>
  // </div>
  //               </div>

  // <div className="space-y-4 mb-8">
  //   {recipients.map((recipient, index) => (
  //     <div key={index} className="flex space-x-4 group">
  //       <input
  //         type="text"
  //         placeholder="Recipient Address"
  //         value={recipient.address}
  //         onChange={(e) => updateRecipient(index, 'address', e.target.value)}
  //         className="flex-1 bg-black/20 backdrop-blur-xl border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:border-fuchsia-500/50 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/20 transition-all"
  //       />
  //       <input
  //         type="number"
  //         placeholder="Amount in SOL"
  //         value={recipient.amount || ''}
  //         onChange={(e) => updateRecipient(index, 'amount', e.target.value)}
  //         min="0"
  //         step="0.000000001"
  //         className="w-40 bg-black/20 backdrop-blur-xl border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:border-cyan-500/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
  //       />
  //       <button
  //         onClick={() => removeRecipient(index)}
  //         className="p-3 text-white/50 hover:text-rose-500 transition-colors backdrop-blur-xl rounded-xl hover:bg-white/5 border border-white/20"
  //         title="Remove recipient"
  //       >
  //         <X size={20} />
  //       </button>
  //     </div>
  //   ))}
  // </div>

  //               <div className="flex justify-center">
  //                 <button
  //                   onClick={handleSend}
  //                   disabled={isProcessing}
  //                   className={`flex items-center space-x-2 px-8 py-4 rounded-xl transition-all duration-300 shadow-lg border border-white/20 ${isProcessing
  //                       ? 'bg-gray-600/80 cursor-not-allowed'
  //                       : 'bg-gradient-to-r from-emerald-500 to-cyan-500 hover:shadow-lg hover:shadow-emerald-500/25'
  //                     } text-white backdrop-blur-xl`}
  //                 >
  //                   <Send size={20} />
  //                   <span>{isProcessing ? 'Processing...' : 'Send SOL'}</span>
  //                 </button>
  //               </div>
  //             </>
  //           )}
  //         </div>
  //       </div>
  //     </div>

  //     <Toaster
  //       position="top-right"
  //       toastOptions={{
  //         style: {
  //           background: 'rgba(13, 17, 23, 0.9)',
  //           backdropFilter: 'blur(16px)',
  //           color: 'white',
  //           border: '1px solid rgba(255, 255, 255, 0.2)',
  //           borderRadius: '12px',
  //           textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
  //         },
  //         success: {
  //           iconTheme: {
  //             primary: '#10B981',
  //             secondary: 'white',
  //           },
  //         },
  //         error: {
  //           iconTheme: {
  //             primary: '#F43F5E',
  //             secondary: 'white',
  //           },
  //         },
  //       }}
  //     />
  //   </div>
  // );


}
