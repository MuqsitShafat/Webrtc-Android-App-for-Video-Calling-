# 📞 React Native WebRTC Video Call App

This is a real-time, peer-to-peer (P2P) video calling application. It allows two users to connect via a unique Caller ID and stream high-quality video and audio directly to each other.

---

## 🛠 How It Works (For Beginners)

This app doesn't just "send video" through a server. It uses **WebRTC**, which stands for *Web Real-Time Communication*. 

1. **Signaling**: The app uses a Socket.io server (your `API_URL`) to help two phones "find" each other.
2. **The Handshake**: Phone A sends an "Offer" (its camera details) to Phone B. Phone B sends back an "Answer."
3. **ICE Candidates**: The phones exchange "ICE Candidates," which are basically digital maps telling each other the best network path to use.
4. **P2P Stream**: Once the handshake is done, the video data travels **directly** from one phone to the other, making it extremely fast.



---

## 🖼 App Visuals (Assets)

We use specific images located in `src/assets/` to make the UI intuitive:
* **`caller.jpeg`**: Background used when you are dialing someone.
* **`receivericon.png`**: The icon shown on the screen when you are receiving a call.
* **`hangup.jpeg`**: The visual for the end-call button.

---

## 🚀 Getting Started

### 1. Requirements
* Only physical Android mobile its not for ios  (WebRTC does not work well on Emulators).
* A running signaling server (Node.js/Socket.io).

### 2. Set Environment Variables
Create a file named `.env` in the root of the project and add your server's address:
```env
API_URL=http://your-server-ip-here:3000