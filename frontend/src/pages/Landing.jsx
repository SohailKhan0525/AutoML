import React from 'react';
import { Link } from 'react-router-dom';

const Landing = () => {
  return (
    <div className="bg-background-light dark:bg-background-dark font-display text-slate-900 dark:text-slate-100">
      {/* Navigation */}
      <nav className="fixed w-full top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-2 rounded-lg text-white">
              <span className="material-symbols-outlined block">analytics</span>
            </div>
            <h1 className="text-xl font-bold">AutoML</h1>
          </div>
          <div className="flex items-center gap-4">
            <a href="#features" className="text-slate-600 dark:text-slate-300 hover:text-primary transition-colors">Features</a>
            <a href="#how-it-works" className="text-slate-600 dark:text-slate-300 hover:text-primary transition-colors">How it Works</a>
            <a href="#pricing" className="text-slate-600 dark:text-slate-300 hover:text-primary transition-colors">Pricing</a>
            <Link to="/signup" className="px-4 py-2 rounded-lg bg-primary text-white hover:opacity-90 transition-opacity">Sign Up</Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="min-h-screen flex items-center justify-center pt-20 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent"></div>
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Turn Your Dataset into <span className="text-primary">ML Insights</span> in Seconds
          </h1>
          <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-300 mb-8 leading-relaxed">
            Upload your CSV, let AutoML analyze it, and get actionable insights instantly. No machine learning expertise required.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link to="/signup" className="px-8 py-4 bg-primary text-white rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-lg">
              <span className="material-symbols-outlined">play_arrow</span>
              Start Free
            </Link>
            <a href="#how-it-works" className="px-8 py-4 border-2 border-slate-300 dark:border-slate-600 rounded-lg font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 text-lg">
              <span className="material-symbols-outlined">play_circle</span>
              Learn More
            </a>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap justify-center gap-6 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-green-500">check_circle</span>
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-green-500">check_circle</span>
              <span>Takes under 2 minutes</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-green-500">check_circle</span>
              <span>Free forever plan</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Powerful Features</h2>
            <p className="text-lg text-slate-600 dark:text-slate-300">Everything you need to transform data into intelligence</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary/50 hover:shadow-lg transition-all bg-slate-50 dark:bg-slate-900/50">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-4 text-2xl">
                <span className="material-symbols-outlined">smart_toy</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Automated Machine Learning</h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                AutoML algorithms automatically select the best models, hyperparameters, and features for your data. No coding required.
              </p>
            </div>

            <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary/50 hover:shadow-lg transition-all bg-slate-50 dark:bg-slate-900/50">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-4 text-2xl">
                <span className="material-symbols-outlined">insights</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Rich Insights</h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Get detailed analysis including correlations, distributions, missing values, and predictive performance metrics.
              </p>
            </div>

            <div className="p-8 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-primary/50 hover:shadow-lg transition-all bg-slate-50 dark:bg-slate-900/50">
              <div className="w-12 h-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mb-4 text-2xl">
                <span className="material-symbols-outlined">download</span>
              </div>
              <h3 className="text-xl font-bold mb-3">Export & Download</h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Export your models, reports, and predictions. Generate Jupyter notebooks for deeper analysis.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 px-6 bg-background-light dark:bg-background-dark">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">How It Works</h2>
            <p className="text-lg text-slate-600 dark:text-slate-300">Three simple steps to ML insights</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="relative">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center text-3xl font-bold mb-4">
                  1
                </div>
                <h3 className="text-xl font-bold mb-3">Upload Your Dataset</h3>
                <p className="text-slate-600 dark:text-slate-400 text-center leading-relaxed">
                  Select your CSV file and upload it. Supports up to 50MB with 100k rows and 200 columns.
                </p>
              </div>
              <div className="hidden md:flex absolute top-16 -right-20 items-center">
                <div className="w-12 text-primary text-4xl">→</div>
              </div>
            </div>

            <div className="relative">
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center text-3xl font-bold mb-4">
                  2
                </div>
                <h3 className="text-xl font-bold mb-3">Analyze & Train</h3>
                <p className="text-slate-600 dark:text-slate-400 text-center leading-relaxed">
                  AutoML automatically analyzes your data, builds models, and optimizes for accuracy in seconds.
                </p>
              </div>
              <div className="hidden md:flex absolute top-16 -right-20 items-center">
                <div className="w-12 text-primary text-4xl">→</div>
              </div>
            </div>

            <div>
              <div className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center text-3xl font-bold mb-4">
                  3
                </div>
                <h3 className="text-xl font-bold mb-3">Download & Export</h3>
                <p className="text-slate-600 dark:text-slate-400 text-center leading-relaxed">
                  Download your trained model, predictions, and comprehensive reports for further analysis.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-6 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Pricing</h2>
            <p className="text-lg text-slate-600 dark:text-slate-300">Start free, upgrade when you need more power</p>
            <div className="mt-4 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg inline-block">
              <p className="text-amber-900 dark:text-amber-200 font-semibold">🚀 Coming Soon: Advanced tiers with premium features</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free Plan */}
            <div className="p-8 rounded-xl border-2 border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 hover:border-primary/50 transition-all">
              <div className="mb-6">
                <h3 className="text-2xl font-bold mb-2">Free</h3>
                <p className="text-slate-600 dark:text-slate-400">Perfect for getting started</p>
              </div>
              
              <div className="mb-6">
                <div className="text-4xl font-bold">$0</div>
                <p className="text-slate-600 dark:text-slate-400 text-sm mt-2">Forever</p>
              </div>

              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-green-500 text-xl">check_circle</span>
                  <span>Fast Mode analysis</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-green-500 text-xl">check_circle</span>
                  <span>Up to 50MB files</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-green-500 text-xl">check_circle</span>
                  <span>Model download</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-green-500 text-xl">check_circle</span>
                  <span>Basic reports</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-green-500 text-xl">check_circle</span>
                  <span>Dataset history</span>
                </li>
              </ul>

              <Link to="/signup" className="w-full inline-flex items-center justify-center py-3 rounded-lg border-2 border-primary text-primary font-semibold hover:bg-primary hover:text-white transition-colors">
                Get Started Free
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="p-8 rounded-xl border-2 border-primary bg-gradient-to-br from-primary/5 to-primary/0 dark:from-primary/10 dark:to-primary/0 hover:shadow-lg transition-all relative">
              <div className="absolute -top-4 right-6 px-4 py-1 bg-primary text-white rounded-full text-sm font-semibold">
                Coming Soon
              </div>
              
              <div className="mb-6">
                <h3 className="text-2xl font-bold mb-2">Pro</h3>
                <p className="text-slate-600 dark:text-slate-400">For advanced analysis</p>
              </div>
              
              <div className="mb-6">
                <div className="text-4xl font-bold">$25</div>
                <p className="text-slate-600 dark:text-slate-400 text-sm mt-2">per month</p>
              </div>

              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-xl">star</span>
                  <span>Advanced Mode analysis</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-xl">star</span>
                  <span>Up to 500MB files</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-xl">star</span>
                  <span>Custom models</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-xl">star</span>
                  <span>Jupyter notebooks</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary text-xl">star</span>
                  <span>Priority support</span>
                </li>
              </ul>

              <button type="button" className="w-full py-3 rounded-lg bg-primary text-white font-semibold hover:opacity-90 transition-opacity opacity-60 cursor-not-allowed" disabled>
                Coming Soon
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 bg-gradient-to-r from-primary/10 to-primary/5 dark:from-primary/20 dark:to-primary/10 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">Ready to transform your data?</h2>
          <p className="text-xl text-slate-600 dark:text-slate-300 mb-8">Join thousands of users discovering insights with AutoML</p>
          <Link to="/signup" className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-white rounded-lg font-semibold hover:opacity-90 transition-opacity text-lg">
            <span className="material-symbols-outlined">play_arrow</span>
            Start Free Today
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-8 px-6 bg-white dark:bg-slate-900">
        <div className="max-w-6xl mx-auto text-center text-slate-600 dark:text-slate-400">
          <p>&copy; 2026 AutoML. All rights reserved. | <a href="#" className="hover:text-primary">Privacy Policy</a> | <a href="#" className="hover:text-primary">Terms of Service</a></p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
