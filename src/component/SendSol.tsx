import React, { useState, useCallback } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
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
import '@solana/wallet-adapter-react-ui/styles.css';

interface Recipient {
  address: string;
  amount: number;
}



export default function SendSol() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
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

    const validRecipients = recipients.filter(({ address, amount }) => {
      return address && amount > 0 && validateSolanaAddress(address);
    });
    
    if (validRecipients.length === 0) {
      toast.error('Please add at least one valid recipient');
      return;
    }

    setIsProcessing(true);

    try {
      const totalAmount = validRecipients.reduce((sum, { amount }) => sum + amount, 0);
      
      const balance = await connection.getBalance(publicKey);
      if (balance < totalAmount * LAMPORTS_PER_SOL) {
        throw new Error('Insufficient balance');
      }

      const instructions = [
        ComputeBudgetProgram.setComputeUnitLimit({
          units: 200000 * validRecipients.length
        })
      ];

      validRecipients.forEach(({ address, amount }) => {
        instructions.push(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: new PublicKey(address),
            lamports: amount * LAMPORTS_PER_SOL
          })
        );
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);

      const signature = await sendTransaction(transaction, connection);
      
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      });

      if (confirmation.value.err) {
        throw new Error('Transaction failed');
      }

      toast.success('Transaction successful! 🎉');
      clearAllRecipients();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error instanceof Error ? error.message : 'Transaction failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117] p-8 relative overflow-hidden">
      {/* Animated gradient orbs */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-gradient-to-r from-[#FF00FF] to-[#7000FF] rounded-full filter blur-[128px] opacity-30 animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-r from-[#00FFFF] to-[#0066FF] rounded-full filter blur-[128px] opacity-30 animate-pulse delay-700"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-to-r from-[#FF00FF] to-[#00FFFF] rounded-full filter blur-[128px] opacity-20 animate-pulse delay-1000"></div>
      </div>

      <div className="max-w-4xl mx-auto relative">
        <div className="backdrop-blur-xl bg-black/30 rounded-[20px] p-8 shadow-2xl border border-white/10 relative overflow-hidden">
          {/* Geometric accents */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#FF00FF]/20 to-transparent transform rotate-45"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-[#00FFFF]/20 to-transparent transform -rotate-45"></div>
          
          <h1 className="text-5xl font-bold text-center mb-8">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#FF00FF] to-[#00FFFF] drop-shadow-[0_0_15px_rgba(255,0,255,0.5)]">
              SOL Splitter
            </span>
          </h1>
          
          <div className="flex justify-center mb-8">
            <WalletMultiButton className="!bg-gradient-to-r !from-[#FF00FF] !to-[#00FFFF] !transition-all !duration-300 !shadow-lg hover:!shadow-[#FF00FF]/25 !border !border-white/20" />
          </div>

          {publicKey && (
            <>
              <div className="mb-8">
                <div className="flex items-center justify-center space-x-4 flex-wrap gap-4">
                  <label className="relative cursor-pointer">
                    <input
                      type="file"
                      className="hidden"
                      accept=".csv,.txt"
                      onChange={handleFileUpload}
                      onClick={(e) => {
                        (e.target as HTMLInputElement).value = '';
                      }}
                    />
                    <div className="flex items-center space-x-2 bg-gradient-to-r from-[#FF00FF] to-[#7000FF] text-white px-6 py-3 rounded-lg transition-all duration-300 shadow-lg hover:shadow-[#FF00FF]/25 border border-white/20">
                      <Upload size={20} />
                      <span>Upload CSV</span>
                    </div>
                  </label>
                  <span className="text-white/80">or</span>
                  <button
                    onClick={addRecipient}
                    className="bg-gradient-to-r from-[#00FFFF] to-[#0066FF] text-white px-6 py-3 rounded-lg transition-all duration-300 shadow-lg hover:shadow-[#00FFFF]/25 border border-white/20"
                  >
                    Add Recipient
                  </button>
                  <button
                    onClick={clearAllRecipients}
                    className="flex items-center space-x-2 bg-gradient-to-r from-[#FF3366] to-[#FF0000] text-white px-6 py-3 rounded-lg transition-all duration-300 shadow-lg hover:shadow-[#FF3366]/25 border border-white/20"
                  >
                    <RefreshCw size={20} />
                    <span>Clear All</span>
                  </button>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                {recipients.map((recipient, index) => (
                  <div key={index} className="flex space-x-4 group">
                    <input
                      type="text"
                      placeholder="Recipient Address"
                      value={recipient.address}
                      onChange={(e) => updateRecipient(index, 'address', e.target.value)}
                      className="flex-1 bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:border-[#FF00FF]/50 focus:outline-none focus:ring-2 focus:ring-[#FF00FF]/20 transition-all backdrop-blur-lg"
                    />
                    <input
                      type="number"
                      placeholder="Amount in SOL"
                      value={recipient.amount || ''}
                      onChange={(e) => updateRecipient(index, 'amount', e.target.value)}
                      min="0"
                      step="0.000000001"
                      className="w-40 bg-black/30 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:border-[#00FFFF]/50 focus:outline-none focus:ring-2 focus:ring-[#00FFFF]/20 transition-all backdrop-blur-lg"
                    />
                    <button
                      onClick={() => removeRecipient(index)}
                      className="p-3 text-white/50 hover:text-[#FF3366] transition-colors backdrop-blur-lg rounded-lg hover:bg-white/5 border border-white/10"
                      title="Remove recipient"
                    >
                      <X size={20} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-center">
                <button
                  onClick={handleSend}
                  disabled={isProcessing}
                  className={`flex items-center space-x-2 px-8 py-4 rounded-lg transition-all duration-300 shadow-lg border border-white/20 ${
                    isProcessing 
                      ? 'bg-gray-600/80 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-[#00FF66] to-[#00FFFF] hover:shadow-[#00FF66]/25'
                  } text-white backdrop-blur-md`}
                >
                  <Send size={20} />
                  <span>{isProcessing ? 'Processing...' : 'Send SOL'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <Toaster 
        position="top-right"
        toastOptions={{
          style: {
            background: 'rgba(13, 17, 23, 0.8)',
            backdropFilter: 'blur(16px)',
            color: 'white',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
          },
          success: {
            iconTheme: {
              primary: '#00FF66',
              secondary: 'white',
            },
          },
          error: {
            iconTheme: {
              primary: '#FF3366',
              secondary: 'white',
            },
          },
        }}
      />
    </div>
  );
}
