import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ROLE, PROFILE_TYPE } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SeedingService {
  private readonly logger = new Logger(SeedingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seedAdmin() {
    const adminEmail = 'admin@campusgigs.com';

    const existingAdmin = await this.prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (!existingAdmin) {
      const salt = await bcrypt.genSalt(10);
      const adminPassword = await bcrypt.hash('Admin@123', salt);

      await this.prisma.user.create({
        data: {
          name: 'Admin',
          email: adminEmail,
          password: adminPassword,
          role: ROLE.admin,
          is_agreed: true,
          professional_interests: '',
          extracurriculars: '',
          certifications: '',
          // skills: [],
          education: '',
          otp: '',
          otp_expiry: '',
          is_banned: false,
          strike_number: 0,
          strike_expiry: null,
          created_at: new Date(),
          updated_at: new Date(),
          is_deleted: false,
        },
      });
      this.logger.log('Admin user created successfully');
    } else {
      this.logger.log('Admin user already exists');
    }
  }

  async seedSubscriptionPlans() {
    const existingCount = await this.prisma.subscriptionPlan.count();
    if (existingCount > 0) {
      this.logger.log(
        `Skipping subscription plans: ${existingCount} plans already exist.`,
      );
      return;
    }

    const plans = [
      {
        name: 'Basic',
        description: 'Perfect for individuals getting started',
        price: 0,
        is_pro: false,
        most_popular: false,
        button_text: 'Get Started',
        icon: '🚀',
        roles_allowed: [PROFILE_TYPE.user],
        max_gig_per_month: 10,
        max_bid_per_month: 0,
        features: [
          'Create and browse gigs',
          'Basic profile',
          'Standard support',
          '10 gig posts per month',
          '0 bids per month',
          'Basic search filters',
        ],
        can_get_badge: false,
      },
      {
        name: 'Premium',
        description: 'Most popular for active users',
        price: 10,
        is_pro: false,
        most_popular: true,
        button_text: 'Upgrade Now',
        icon: '⭐',
        roles_allowed: [PROFILE_TYPE.user, PROFILE_TYPE.provider],
        max_gig_per_month: 3,
        max_bid_per_month: 10,
        features: [
          'Everything in Basic',
          'Priority listing',
          'Advanced search filters',
          '3 gig posts per month',
          '10 bids per month',
          'Priority support',
          'Analytics dashboard',
          'Custom profile badge',
        ],
        can_get_badge: true,
      },
      {
        name: 'Pro',
        description: 'For serious providers',
        price: 20,
        is_pro: true,
        most_popular: false,
        button_text: 'Go Pro',
        icon: '👑',
        roles_allowed: [PROFILE_TYPE.user, PROFILE_TYPE.provider],
        max_gig_per_month: null,
        max_bid_per_month: null,
        features: [
          'Everything in Premium',
          'Featured listings',
          'Advanced analytics',
          'Direct messaging',
          'Custom domain',
          'API access',
          'Priority dispute resolution',
          'Exclusive events access',
          'Unlimited gig posts',
          'Unlimited bids',
        ],
        can_get_badge: true,
      },
    ];

    for (const plan of plans) {
      await this.prisma.subscriptionPlan.create({
        data: plan,
      });
      this.logger.log(`Created plan: ${plan.name}`);
    }
  }

  async seedTerms() {
    const existingCount = await this.prisma.terms.count();
    if (existingCount > 0) {
      this.logger.log(
        `Skipping terms and conditions: ${existingCount} terms and conditions already exist.`,
      );
      return;
    }

    const termsConditions = {
      content: `<h1>Terms and Conditions - <strong>CampusGigs</strong></h1><h1>Introduction</h1><p><strong>CampusGigs</strong> is a platform that connects Users seeking services with Providers offering them through a bidding system. These terms and conditions govern your use of the platform. Please read them carefully.</p><h2>Platform Roles</h2><p>There are two main roles within the <strong>CampusGigs</strong> ecosystem:</p><ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>User</strong>: Posts service requests and selects a bid from Providers.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Provider</strong>: Bids on service requests and completes the selected tasks.</li></ol><h2>User Responsibilities</h2><p>As a User of <strong>CampusGigs</strong>, you agree to the following:</p><ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Post clear and accurate service requests, including all relevant details and expectations.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Choose bids in good faith based on Provider qualifications, pricing, and proposed timelines.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Provide fair and honest ratings upon service completion, reflecting the quality of the service received.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Raise complaints responsibly, providing clear and detailed information in cases of dissatisfaction.</li></ol><h2>Provider Responsibilities</h2><p>As a Provider on <strong>CampusGigs</strong>, you agree to the following:</p><ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Submit honest and competitive bids that accurately reflect your skills, experience, and availability.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Deliver services within the agreed-upon timelines and to the standards outlined in your bid and subsequent communication.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Maintain professionalism in all interactions with Users and other Providers, exhibiting courteous and respectful behavior.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Accept that payment is contingent on a User rating of 3 stars or higher, reflecting satisfactory service delivery.</li></ol><h2>Payment and Rating Policy</h2><ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Payments for services are held securely in escrow by <strong>CampusGigs</strong> until the service is completed to the User's satisfaction.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Users are required to rate the Provider within a specified timeframe after service completion.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Ratings of <strong>3 stars or higher</strong> will automatically release the payment from escrow to the Provider.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Ratings <strong>below 3 stars</strong> will hold the payment and trigger a formal complaint process for resolution.</li></ol><h2>Dispute Resolution</h2><p>If a complaint is raised regarding a service:</p><ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>The <strong>CampusGigs</strong> administration team will thoroughly review evidence submitted by both the User and the Provider.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>The administration team may request additional details or suggest mediation between the parties involved.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Final decisions regarding payment release or refund will be made based on the evidence and the outcome of any mediation efforts. <strong>CampusGigs</strong> reserves the right to make the final determination.</li></ol><h2>Prohibited Actions</h2><p>You are strictly prohibited from engaging in the following activities on the <strong>CampusGigs</strong> platform:</p><ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Posting fake gigs or submitting fraudulent bids with the intention of misleading or deceiving other users.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Attempting to manipulate the rating system or payment process to unfairly benefit yourself or harm others.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Harassing, abusing, or attempting to scam other users or providers on the <strong>CampusGigs</strong> platform.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Circumventing the <strong>CampusGigs</strong> platform to engage in direct transactions with other users or providers, thereby avoiding platform fees and protections.</li></ol><h2>Privacy Policy</h2><p><strong>CampusGigs</strong> collects and uses user data for the following purposes:</p><ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>User verification and secure transaction processing to protect all parties involved.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Service matching and personalized account management to optimize the user experience.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Platform improvement and effective dispute handling to ensure a fair and efficient marketplace.</li></ol><h2>Account Termination</h2><p><strong>CampusGigs</strong> reserves the right to suspend or terminate user accounts for the following reasons:</p><ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Breaching any of these terms and conditions, demonstrating a disregard for platform rules.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Consistent low ratings or unresolved complaints, indicating a pattern of unsatisfactory service or behavior.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span>Fraudulent or harmful behavior that threatens the integrity of the <strong>CampusGigs</strong> platform.</li></ol>`,
    };

    await this.prisma.terms.create({
      data: termsConditions,
    });
    this.logger.log('Terms and conditions created successfully');
  }

  async seedPrivacyPolicy() {
    const existingCount = await this.prisma.privacyPolicy.count();
    if (existingCount > 0) {
      this.logger.log(
        `Skipping privacy policy: ${existingCount} privacy policy already exist.`,
      );
      return;
    }

    const privacyPolicy = {
      content:
        '<h1>Privacy Policy for <strong>CampusGigs</strong></h1><p><strong>Introduction</strong></p><p><strong>CampusGigs</strong> is committed to protecting the privacy of its Users and Providers. This Privacy Policy outlines how we collect, use, and safeguard your information. It applies to all individuals who access or use our platform.</p><h2>Data Collection</h2><p>We collect information to provide a seamless and efficient experience on <strong>CampusGigs</strong>. This includes several categories of data, detailed below.</p><ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Personal Identification Details:</strong> This includes your name, email address, phone number, and profile picture.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Service Request and Bid Information:</strong> Details about the services you request or offer, including descriptions, prices, and deadlines.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Communication and Transaction Records:</strong> Records of your communications with other users and details of completed transactions.</li></ol><h2>Use of Information</h2><p>Your data is used to facilitate the functionality of <strong>CampusGigs</strong> and improve user experience.</p><ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Account Creation and Management:</strong> Creating and managing your account, including password resets and profile updates.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Service Matching and Communication:</strong> Connecting Users with Providers based on service requests and facilitating communication between them.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Payment Processing and Dispute Resolution:</strong> Processing payments for completed services and resolving any disputes that may arise.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Platform Improvement and Analytics:</strong> Analyzing platform usage to identify areas for improvement and enhance user experience.</li></ol><h2>Data Sharing</h2><p>We prioritize the security and privacy of your information and limit data sharing.</p><ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Service Providers and Users for Transaction Purposes:</strong> Sharing necessary information (e.g., contact details, service requirements) between Users and Providers to facilitate transactions.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Third-Party Payment Processors:</strong> Sharing payment information with secure third-party payment processors to process transactions.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Legal Authorities if Required by Law:</strong> Disclosing information to legal authorities if required by law or in response to a valid legal request. We do not sell your personal information to third parties.</li></ol><h2>User Rights</h2><p>You have specific rights regarding your personal data on <strong>CampusGigs</strong>.</p><ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Access and Update Your Information:</strong> You can access and update your personal information through your account settings.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Request Deletion of Your Account:</strong> You can request the deletion of your account and associated data, subject to certain legal and contractual obligations.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Object to Certain Data Uses:</strong> You can object to certain uses of your data, such as receiving promotional emails.</li></ol><h2>Data Security</h2><p>We implement robust security measures to protect your data from unauthorized access.</p><ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Encryption of Sensitive Information:</strong> Encrypting sensitive information, such as passwords and financial details, to protect it during transmission and storage.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Regular Security Audits:</strong> Conducting regular security audits to identify and address potential vulnerabilities.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Restricted Access to Personal Data:</strong> Limiting access to personal data to authorized personnel only.</li></ol><h2>Cookies and Tracking</h2><p><strong>CampusGigs</strong> uses cookies and similar technologies to enhance your experience.</p><ol><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Enhance User Experience:</strong> Improving the overall user experience by remembering your preferences and settings.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Analyze Platform Usage:</strong> Analyzing platform usage to understand how users interact with <strong>CampusGigs</strong> and identify areas for improvement.</li><li data-list="bullet"><span class="ql-ui" contenteditable="false"></span><strong>Personalize Content and Ads:</strong> Personalizing content and ads based on your interests and browsing history.</li></ol><h2>Policy Updates</h2><p>We may update this Privacy Policy periodically to reflect changes in our practices.</p><p>Users will be notified of significant changes via email or platform notifications. We encourage you to review this policy regularly to stay informed.</p>',
    };

    await this.prisma.privacyPolicy.create({
      data: privacyPolicy,
    });
    this.logger.log('Privacy policy created successfully');
  }

  async runAllSeeds() {
    try {
      await this.seedAdmin();
      await this.seedSubscriptionPlans();
      await this.seedTerms();
      await this.seedPrivacyPolicy();
      this.logger.log('All seeds completed successfully');
    } catch (error) {
      this.logger.error('Error running seeds:', error);
      throw error;
    }
    // Add more seed methods
  }
}
