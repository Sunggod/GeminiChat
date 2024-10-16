import React, { useState, useEffect, FormEvent, useRef } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Image as ImageIcon, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCaVzywfweyQtdGosQ9UMLVdTIpmd_nGVU",
    authDomain: "chat-gemini-aef99.firebaseapp.com",
    projectId: "chat-gemini-aef99",
    storageBucket: "chat-gemini-aef99.appspot.com",
    messagingSenderId: "1044480653169",
    appId: "1:1044480653169:web:cf133941bcc091a46b28d0"
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

const API_KEY = 'AIzaSyD3eDDZkP2J9IeHNZ3EX7bPWPFEWXvUpNE';
const genAI = new GoogleGenerativeAI(API_KEY);

interface ColoredSegment {
    text: string;
    className?: string;
    marker?: string;
}

interface Message {
    id: string;
    role: 'user' | 'ai';
    content: string;
    image?: string;
    timestamp: number;
    segments?: ColoredSegment[];
}
const parseColoredText = (text: string): ColoredSegment[] => {
    const colorMap: { [key: string]: string } = {
        '#': 'text-blue-500 font-medium',
        '*': 'text-emerald-500 font-medium',
        '@': 'text-rose-500 font-medium',
        '&': 'text-purple-500 font-medium',
        '^': 'text-amber-500 font-medium',
        '~': 'text-cyan-500 font-medium',
        '$': 'text-indigo-500 font-medium',
        '``': 'text-black'
    };

    const segments: ColoredSegment[] = [];
    let currentText = '';
    let currentMarker: string | null = null;
    
    const processSegment = (text: string, marker?: string) => {
        if (text) {
            segments.push({
                text,  // Não precisa remover mais caracteres além dos marcadores de cor
                className: marker ? colorMap[marker] : undefined,
                marker
            });
        }
    };

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        // Detecta o marcador de cor
        if (Object.keys(colorMap).includes(char) && !currentMarker) {
            if (currentText) {
                processSegment(currentText);  // Processa o texto sem marcador
            }
            currentText = '';
            currentMarker = char;  // Inicia um novo marcador
        } else if (char === currentMarker) {
            processSegment(currentText, currentMarker ?? undefined);  // Processa o texto colorido
            currentText = '';
            currentMarker = null;  // Reseta o marcador
        } else {
            currentText += char;  // Continua adicionando o texto
        }
    }

    if (currentText) {
        processSegment(currentText, currentMarker ?? undefined);  // Processa o último pedaço de texto
    }

    // Filtra segmentos para garantir que o marcador não esteja presente no texto final
    return segments
        .filter(segment => segment.text.length > 0)
        .map(segment => ({
            ...segment,
            text: segment.text.replace(/[!@#$%^&*~]/g, '') // Remove os próprios caracteres de marcador do texto
        }));
};



interface TypewriterTextProps {
    segments: ColoredSegment[];
    speed?: number;
}


const TypewriterText: React.FC<TypewriterTextProps> = ({ segments, speed = 30 }) => {
    const [displayedText, setDisplayedText] = useState<string[]>(segments.map(() => ''));
    const [isComplete, setIsComplete] = useState(false);
    const totalLength = segments.reduce((acc, seg) => acc + seg.text.length, 0);
    const [currentTotal, setCurrentTotal] = useState(0);
    
    useEffect(() => {
        if (currentTotal >= totalLength) {
            setIsComplete(true);
            return;
        }

        const timer = setTimeout(() => {
            let charCount = 0;
            const newDisplayedText = segments.map((segment) => {
                const prevCharCount = charCount;
                charCount += segment.text.length;
                
                if (currentTotal <= prevCharCount) {
                    return '';
                } else if (currentTotal >= charCount) {
                    return segment.text;
                } else {
                    return segment.text.slice(0, currentTotal - prevCharCount);
                }
            });

            setDisplayedText(newDisplayedText);
            setCurrentTotal(prev => prev + 1);
        }, speed);

        return () => clearTimeout(timer);
    }, [currentTotal, segments, speed, totalLength]);

    return (
        <div className="inline">
            {segments.map((segment, i) => (
                <span
                    key={i}
                    className={`${segment.className || ''} transition-colors duration-300`}
                >
                    {displayedText[i]}
                </span>
            ))}
            {!isComplete && (
                <span className="animate-pulse ml-0.5 h-4 w-0.5 bg-current inline-block" />
            )}
        </div>
    );
};

const GeminiChat: React.FC = () => {
    const [input, setInput] = useState<string>('');
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollAreaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadMessages();
    }, []);

    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
        }
    }, [messages]);

    const loadMessages = () => {
        const storedMessages = localStorage.getItem('chatHistory');
        if (storedMessages) {
            try {
                const parsedMessages = JSON.parse(storedMessages);
                if (Array.isArray(parsedMessages)) {
                    const sortedMessages = parsedMessages.sort((a, b) => a.timestamp - b.timestamp);
                    setMessages(sortedMessages);
                }
            } catch (error) {
                console.error('Error retrieving chat history:', error);
                localStorage.removeItem('chatHistory');
            }
        }
    };

    const saveMessages = (newMessages: Message[]) => {
        try {
            localStorage.setItem('chatHistory', JSON.stringify(newMessages));
        } catch (error) {
            console.error('Error saving chat history:', error);
        }
    };

    const fileToGenerativePart = async (file: File): Promise<Part> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64data = reader.result as string;
                const base64Content = base64data.split(',')[1];
                resolve({
                    inlineData: {
                        data: base64Content,
                        mimeType: file.type
                    }
                });
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const uploadImageToFirebase = async (file: File): Promise<string> => {
        const storageRef = ref(storage, `images/${file.name}`);
        await uploadBytes(storageRef, file);
        return getDownloadURL(storageRef);
    };

    const improveAIResponse = (response: string): string => {
        response = response.replace(/\n/g, '\n\n');
        response = response.charAt(0).toUpperCase() + response.slice(1);
        return response.trim();
    };

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!input.trim() && !selectedImage) return;

        setIsLoading(true);
        let imageUrl = '';
        let imagePart: Part | null = null;

        if (selectedImage) {
            try {
                imageUrl = await uploadImageToFirebase(selectedImage);
                imagePart = await fileToGenerativePart(selectedImage);
            } catch (error) {
                console.error('Error processing image:', error);
                setIsLoading(false);
                return;
            }
        }

        const newMessage: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input,
            image: imageUrl,
            timestamp: Date.now()
        };

        const newMessages = [...messages, newMessage];
        setMessages(newMessages);
        setInput('');
        setSelectedImage(null);
        saveMessages(newMessages);

        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-002" });
            const context = messages.map(msg => `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`).join('\n');
            
            const prompt = `
            Contexto da nossa conversa:
            ${context}

            Humano: ${input.trim() || "Descreva esta imagem"}

            Assistente: Considerando o histórico da nossa conversa e a entrada atual, aqui está minha resposta. Use os seguintes marcadores para destacar partes importantes do texto:
            # para azul
            * para verde
            @ para vermelho
            & para roxo
            ^ para amarelo
            ~ para ciano
            $ para índigo
            o assento quando for duplo é ´ representa a cor preta 
            Use esses marcadores apenas quando necessário para destacar informações importantes.
            Lembre-se de responder de maneira descontraída e agradável, tente aplicar um sotaque e girias gaúchas, do estado rio grande do sul do brasíl!
            `;
            
            const parts: (string | Part)[] = [prompt];
            if (imagePart) {
                parts.push(imagePart);
            }

            const result = await model.generateContent(parts);
            const response = await result.response;
            let aiResponse = response.text();
            aiResponse = improveAIResponse(aiResponse);

            const aiMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                content: aiResponse,
                timestamp: Date.now(),
                segments: parseColoredText(aiResponse)
            };

            const updatedMessages = [...newMessages, aiMessage];
            setMessages(updatedMessages);
            saveMessages(updatedMessages);
        } catch (error) {
            console.error('Error:', error);
            const errorMessage: Message = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                content: 'An error occurred while processing your request. Please try again.',
                timestamp: Date.now(),
                segments: [{ text: 'An error occurred while processing your request. Please try again.' }]
            };
            const updatedMessages = [...newMessages, errorMessage];
            setMessages(updatedMessages);
            saveMessages(updatedMessages);
        } finally {
            setIsLoading(false);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedImage(e.target.files[0]);
        }
    };

    const clearHistory = () => {
        setMessages([]);
        localStorage.removeItem('chatHistory');
    };
    
    const renderMessageContent = (message: Message) => {
        if (message.role === 'ai' && message.segments) {
            return <TypewriterText segments={message.segments} speed={30} />;
        }
        return <span>{message.content}</span>;
    };

    return (
        <Card className="w-full max-w-2xl mx-auto">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-2xl font-bold text-primary">Gemini Chat</CardTitle>
                <Button variant="outline" onClick={clearHistory}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear History
                </Button>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[500px] pr-4" ref={scrollAreaRef}>
                    <AnimatePresence>
                        {messages.map((message) => (
                            <motion.div
                                key={message.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ duration: 0.3 }}
                                className={`flex mb-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`flex ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start`}>
                                    <Avatar className={`w-10 h-10 ${message.role === 'user' ? 'ml-3' : 'mr-3'}`}>
                                        <AvatarImage src={message.role === 'user' ? "/user-avatar.png" : "/gemini-avatar.png"} />
                                        <AvatarFallback>{message.role === 'user' ? 'U' : 'G'}</AvatarFallback>
                                    </Avatar>
                                    <motion.div
                                        className={`max-w-xs sm:max-w-md p-3 rounded-lg ${
                                            message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                                        }`}
                                        initial={{ scale: 0.8 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: "spring", stiffness: 200, damping: 10 }}
                                    >
                                        {message.image && (
                                            <img src={message.image} alt="Uploaded" className="max-w-full mb-2 rounded" />
                                        )}
                                        <div className="text-sm whitespace-pre-wrap">
                                            {renderMessageContent(message)}
                                        </div>
                                        <p className="text-xs mt-1 opacity-50">
                                            {new Date(message.timestamp).toLocaleString()}
                                        </p>
                                    </motion.div>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {isLoading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex justify-center items-center mt-4"
                        >
                            <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        </motion.div>
                    )}
                </ScrollArea>
            </CardContent>
            <CardFooter className="border-t">
                <form onSubmit={handleSubmit} className="flex w-full space-x-2">
                    <div className="relative flex-grow">
                        <Input
                            value={input}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                            placeholder="Type your message..."
                            className="pr-10"
                        />
                        {selectedImage && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                                <div className="text-xs text-muted-foreground">
                                    Image selected
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => setSelectedImage(null)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>
                    
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        ref={fileInputRef}
                        className="hidden"
                    />
                    
                    <div className="flex space-x-2">
                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="relative"
                        >
                            <Button 
                                type="button"
                                variant="outline"
                                className={`transition-colors ${selectedImage ? 'bg-primary/10' : ''}`}
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isLoading}
                            >
                                <ImageIcon className="w-4 h-4" />
                            </Button>
                        </motion.div>
                        
                        <motion.div
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            <Button 
                                type="submit" 
                                disabled={isLoading}
                                className="relative"
                            >
                                {isLoading ? (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    </motion.div>
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                            </Button>
                        </motion.div>
                    </div>
                </form>
            </CardFooter>
        </Card>
    );
};

const App: React.FC = () => {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<GeminiChat />} />
            </Routes>
        </Router>
    );
};

export default App;