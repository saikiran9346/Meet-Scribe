# 🚀 Complete Deployment Guide for Meet-Scribe

Deploy your AI meeting bot to AWS EC2 (Free Tier) and Netlify (Free)

---

## **PHASE 1: Create AWS Account**

### Step 1.1: Visit AWS
1. Go to [https://aws.amazon.com](https://aws.amazon.com)
2. Click **"Create an AWS Account"** (top-right)

### Step 1.2: Enter Account Information
- **Email address:** Your email
- **AWS account name:** `meet-scribe-account` (or any name)
- **Password:** Strong password (min 8 chars, uppercase, number, symbol)
- Click **"Continue"**

### Step 1.3: Add Contact Information
- **Full name:** Your name
- **Phone number:** Your phone (for verification)
- **Country:** Select your country
- **Address:** Your address
- **City, State, ZIP:** Your location
- ✅ Check: "I agree to AWS Customer Agreement"
- Click **"Continue"**

### Step 1.4: Add Billing Information
- **Credit/Debit Card:** Enter card details
- Click **"Verify and Add"**
- **Note:** You WON'T be charged during Free Tier (6 months)

### Step 1.5: Verify Phone Number
- Choose **"Text Message (SMS)"**
- Enter your phone number
- Verify the code sent to your phone
- Click **"Continue"**

### Step 1.6: Choose Support Plan
- Select **"Basic Support (Free)"**
- Click **"Complete Sign Up"**

### Step 1.7: Confirmation
- You'll see "Congratulations!"
- Click **"Go to the AWS Management Console"**
- Login with your email and password

---

## **PHASE 2: Create EC2 Instance**

### Step 2.1: Navigate to EC2
1. Search for **"EC2"** in the AWS Console search bar
2. Click **"EC2"** → **"Instances"**
3. Click **"Launch Instances"** (orange button)

### Step 2.2: Configure Instance Details

**Name:**
- Enter: `meet-scribe-backend`

**AMI (Operating System):**
- Select: **Ubuntu 24.04 LTS** (Free tier eligible, marked with "Free tier eligible")

**Instance Type:**
- Select: **t2.micro** ✅ (Free tier eligible)
- Click **"Next: Configure Instance Details"**

### Step 2.3: Network Settings

**VPC:** Leave default
**Subnet:** Leave default
**Auto-assign public IP:** **Enable**
**IAM instance profile:** Leave default

Click **"Next: Add Storage"**

### Step 2.4: Storage

**Size:** 30 GB (Free tier = 30GB free per month)
**Volume Type:** gp3 (default)

Click **"Next: Add Tags"**

### Step 2.5: Tags (Optional)

**Add Tag:**
- Key: `Name`
- Value: `meet-scribe-backend`

Click **"Next: Configure Security Group"**

### Step 2.6: Security Group (IMPORTANT)

**Name:** `meet-scribe-sg`
**Description:** `Security group for Meet-Scribe bot`

**Add these rules:**
| Type | Protocol | Port Range | Source |
|------|----------|-----------|--------|
| SSH | TCP | 22 | 0.0.0.0/0 (My IP recommended) |
| HTTP | TCP | 80 | 0.0.0.0/0 |
| HTTPS | TCP | 443 | 0.0.0.0/0 |
| Custom TCP | TCP | 8080 | 0.0.0.0/0 |

Click **"Review and Launch"**

### Step 2.7: Review & Create Key Pair

- Click **"Launch"**
- **Select an existing key pair OR create a new key pair**
- ✅ **CREATE NEW KEY PAIR** (recommended)
  - Key pair name: `meet-scribe-key`
  - Key pair type: RSA
  - Click **"Create key pair"**
  - **⚠️ DOWNLOAD AND SAVE** `meet-scribe-key.pem` in a safe folder
  - Click **"Launch Instances"**

**You'll see:** "Successfully launched 7 instances"

---

## **PHASE 3: Connect to EC2 Instance**

### Step 3.1: Get Instance Details

1. Go to **EC2 → Instances**
2. Wait for instance to show **"Running"** status
3. Click on your instance
4. Copy the **"Public IPv4 address"** (e.g., `54.123.45.67`)

### Step 3.2: Connect via SSH (Windows PowerShell)

```powershell
# Navigate to the folder where you saved meet-scribe-key.pem
cd C:\path\to\key\folder

# Connect to EC2
ssh -i meet-scribe-key.pem ubuntu@YOUR_PUBLIC_IP

# Replace YOUR_PUBLIC_IP with the IP from Step 3.1
# Example: ssh -i meet-scribe-key.pem ubuntu@54.123.45.67

# Answer "yes" when asked "Are you sure you want to continue connecting?"
```

✅ **You're now connected to your EC2 instance!**

---

## **PHASE 4: Install Dependencies**

### Step 4.1: Update System
```bash
sudo apt-get update
sudo apt-get upgrade -y
```

### Step 4.2: Install Node.js
```bash
sudo apt-get install -y nodejs npm
node --version
npm --version
```

### Step 4.3: Install Chrome (for Puppeteer)
```bash
sudo apt-get install -y chromium-browser
```

### Step 4.4: Install Git
```bash
sudo apt-get install -y git
git --version
```

### Step 4.5: Install PM2 (to keep server running)
```bash
sudo npm install -g pm2
pm2 --version
```

---

## **PHASE 5: Deploy Your Code**

### Step 5.1: Clone Your Repository
```bash
cd ~
git clone https://github.com/saikiran9346/Meet-Scribe.git
cd Meet-Scribe
```

### Step 5.2: Install Backend Dependencies
```bash
cd backend
npm install
```

### Step 5.3: Create .env File
```bash
nano .env
```

**Copy and paste:**
```
PORT=8080
FRONTEND_URL=http://YOUR_DOMAIN_OR_IP
DEEPGRAM_API_KEY=your_deepgram_key
GROQ_API_KEY=your_groq_key
CHROME_PROFILE_PATH=/home/ubuntu/.config/google-chrome/BotProfile
CHROME_EXECUTABLE_PATH=/usr/bin/chromium-browser
HEADLESS=true
```

**Replace:**
- `YOUR_DOMAIN_OR_IP` → Your EC2 public IP
- `your_deepgram_key` → Your actual Deepgram key
- `your_groq_key` → Your actual Groq key

**Save:** Press `Ctrl+X`, then `Y`, then `Enter`

### Step 5.4: Start Server with PM2
```bash
pm2 start server.js --name "meet-scribe-bot"
pm2 save
pm2 startup
```

**Verify it's running:**
```bash
pm2 status
```

---

## **PHASE 6: Test Backend**

### From your local Windows PowerShell:
```powershell
# Replace with your EC2 public IP
curl http://54.123.45.67:8080

# You should see the server response
```

---

## **PHASE 7: Deploy Frontend on Netlify**

### Step 7.1: Visit Netlify
1. Go to [https://netlify.com](https://netlify.com)
2. Click **"Sign up"**

### Step 7.2: Sign Up with GitHub
1. Click **"GitHub"**
2. Authorize Netlify to access your GitHub
3. You'll be logged in

### Step 7.3: Deploy Frontend
1. Click **"New site from Git"** or **"Add new site"**
2. Select **"GitHub"**
3. Search for **"Meet-Scribe"** repository
4. Click the repository to connect

### Step 7.4: Configure Build Settings
- **Base directory:** `frontend`
- **Build command:** `npm run build`
- **Publish directory:** `frontend/build`
- Click **"Deploy site"**

### Step 7.5: Update Frontend .env

Once Netlify deployment is done:

1. Create `.env.production` in `frontend/`:
```
REACT_APP_BACKEND_URL=http://54.123.45.67:8080
REACT_APP_FIREBASE_API_KEY=your_firebase_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_firebase_domain
```

2. Push to GitHub:
```bash
git add frontend/.env.production
git commit -m "Update production API URL"
git push
```

3. Netlify auto-redeploys ✅

---

## **PHASE 8: Domain Setup (Optional)**

### For Custom Domain:
1. In Netlify dashboard → **Domain settings**
2. Click **"Add custom domain"**
3. Enter your domain
4. Follow DNS configuration steps

### For AWS Domain (Route 53):
1. In AWS Console → **Route 53**
2. Create hosted zone
3. Point to Netlify nameservers

---

## **Troubleshooting**

### Backend not accessible?
```bash
# Check if server is running
pm2 status

# View logs
pm2 logs meet-scribe-bot

# Check security group allows port 8080
# (AWS Console → EC2 → Security Groups)
```

### Chrome not found?
```bash
which chromium-browser
# Should return: /usr/bin/chromium-browser
```

### Port already in use?
```bash
lsof -i :8080
kill -9 <PID>
```

---

## **Summary**

| Component | Status | URL |
|-----------|--------|-----|
| Backend | ✅ Running on EC2 | `http://YOUR_IP:8080` |
| Frontend | ✅ Deployed on Netlify | `https://your-netlify-site.netlify.app` |
| Database | ✅ Local storage on EC2 | `/home/ubuntu/Meet-Scribe/backend/data` |
| **Cost (First 6 Months)** | ✅ **FREE** | AWS Free Tier + Netlify Free |
| **Cost (After 6 Months)** | ✅ ~$13-20/month | EC2 t2.micro + Data Transfer |

---

## **Next Steps**

1. ✅ Test the bot on Google Meet
2. ✅ Monitor logs with `pm2 logs`
3. ✅ Set up auto-scaling if needed
4. ✅ Add custom domain
5. ✅ Set up monitoring/alerts

---

**Questions? Let me know! 🚀**
