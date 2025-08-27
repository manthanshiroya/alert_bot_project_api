# Alert Bot Project - DevOps & Deployment Strategy

## Overview

This document outlines the comprehensive DevOps strategy for the Alert Bot microservices architecture, covering containerization, orchestration, CI/CD pipelines, monitoring, security, and deployment strategies.

## Infrastructure Architecture

### Cloud Provider Strategy

```yaml
# Multi-Cloud Strategy
cloud_providers:
  primary: AWS
  secondary: Google Cloud Platform
  backup: Azure
  
regions:
  primary: us-east-1 (AWS)
  secondary: us-west-2 (AWS)
  disaster_recovery: europe-west1 (GCP)

availability_zones:
  production: 3 AZs minimum
  staging: 2 AZs
  development: 1 AZ
```

### Infrastructure Components

```yaml
# AWS Infrastructure
aws_infrastructure:
  compute:
    - EKS (Kubernetes)
    - EC2 instances (worker nodes)
    - Fargate (serverless containers)
    - Lambda (event processing)
  
  storage:
    - EBS (persistent volumes)
    - S3 (object storage)
    - EFS (shared file system)
  
  database:
    - DocumentDB (MongoDB compatible)
    - ElastiCache (Redis)
    - RDS (PostgreSQL for analytics)
  
  networking:
    - VPC (Virtual Private Cloud)
    - ALB (Application Load Balancer)
    - CloudFront (CDN)
    - Route 53 (DNS)
  
  security:
    - IAM (Identity and Access Management)
    - Secrets Manager
    - Certificate Manager
    - WAF (Web Application Firewall)
  
  monitoring:
    - CloudWatch
    - X-Ray (distributed tracing)
    - CloudTrail (audit logs)
```

## Containerization Strategy

### Docker Configuration

```dockerfile
# Base Node.js Dockerfile Template
FROM node:18-alpine AS base

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies
FROM base AS dependencies
RUN npm ci --only=production && npm cache clean --force

# Development stage
FROM base AS development
RUN npm ci
COPY . .
USER nodejs
EXPOSE 3000
CMD ["dumb-init", "npm", "run", "dev"]

# Production stage
FROM base AS production
COPY --from=dependencies /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .
USER nodejs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
CMD ["dumb-init", "npm", "start"]
```

### Multi-Stage Build Optimization

```dockerfile
# Optimized Dockerfile for API Gateway
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Remove unnecessary files
RUN npm prune --production
RUN rm -rf node_modules/*/test node_modules/*/tests
RUN rm -rf node_modules/*/*.md node_modules/*/README*

FROM node:18-alpine AS runtime
RUN apk add --no-cache dumb-init curl
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy optimized dependencies
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

USER nodejs
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["dumb-init", "node", "src/index.js"]
```

### Container Security

```yaml
# Security Scanning Configuration
security_scanning:
  tools:
    - Trivy (vulnerability scanning)
    - Snyk (dependency scanning)
    - Hadolint (Dockerfile linting)
    - Docker Bench (security benchmark)
  
  policies:
    - No root user in containers
    - Minimal base images (Alpine)
    - Regular security updates
    - Secrets via environment variables only
    - Read-only root filesystem where possible
  
  scanning_schedule:
    - On every build
    - Daily scheduled scans
    - Before production deployment
```

## Kubernetes Configuration

### Cluster Architecture

```yaml
# EKS Cluster Configuration
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig

metadata:
  name: alertbot-cluster
  region: us-east-1
  version: "1.28"

availabilityZones:
  - us-east-1a
  - us-east-1b
  - us-east-1c

nodeGroups:
  - name: system-nodes
    instanceType: t3.medium
    minSize: 2
    maxSize: 4
    desiredCapacity: 2
    labels:
      role: system
    taints:
      - key: CriticalAddonsOnly
        value: "true"
        effect: NoSchedule
  
  - name: application-nodes
    instanceType: t3.large
    minSize: 3
    maxSize: 10
    desiredCapacity: 3
    labels:
      role: application
    
  - name: monitoring-nodes
    instanceType: t3.medium
    minSize: 1
    maxSize: 3
    desiredCapacity: 1
    labels:
      role: monitoring

addons:
  - name: vpc-cni
  - name: coredns
  - name: kube-proxy
  - name: aws-ebs-csi-driver
  - name: aws-load-balancer-controller

cloudWatch:
  clusterLogging:
    enable: true
    logTypes:
      - api
      - audit
      - authenticator
      - controllerManager
      - scheduler
```

### Namespace Strategy

```yaml
# Namespace Configuration
namespaces:
  - name: alertbot-prod
    labels:
      environment: production
      team: alertbot
    annotations:
      scheduler.alpha.kubernetes.io/node-selector: role=application
  
  - name: alertbot-staging
    labels:
      environment: staging
      team: alertbot
  
  - name: alertbot-dev
    labels:
      environment: development
      team: alertbot
  
  - name: monitoring
    labels:
      purpose: monitoring
  
  - name: ingress-nginx
    labels:
      purpose: ingress
```

### Service Deployment Manifests

```yaml
# API Gateway Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: alertbot-prod
  labels:
    app: api-gateway
    version: v1
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
        version: v1
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: api-gateway
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
        fsGroup: 1001
      containers:
      - name: api-gateway
        image: alertbot/api-gateway:latest
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
        - name: MONGODB_URI
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: mongodb-uri
        - name: REDIS_URI
          valueFrom:
            secretKeyRef:
              name: database-secrets
              key: redis-uri
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: jwt-secret
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
            - ALL
        volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: logs
          mountPath: /app/logs
      volumes:
      - name: tmp
        emptyDir: {}
      - name: logs
        emptyDir: {}
      nodeSelector:
        role: application
      tolerations:
      - key: "application"
        operator: "Equal"
        value: "true"
        effect: "NoSchedule"

---
apiVersion: v1
kind: Service
metadata:
  name: api-gateway
  namespace: alertbot-prod
  labels:
    app: api-gateway
spec:
  selector:
    app: api-gateway
  ports:
  - port: 80
    targetPort: 3000
    protocol: TCP
    name: http
  type: ClusterIP

---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-gateway
  namespace: alertbot-prod
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
spec:
  tls:
  - hosts:
    - api.alertbot.com
    secretName: api-gateway-tls
  rules:
  - host: api.alertbot.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-gateway
            port:
              number: 80
```

### Horizontal Pod Autoscaler

```yaml
# HPA Configuration
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway-hpa
  namespace: alertbot-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  - type: Pods
    pods:
      metric:
        name: http_requests_per_second
      target:
        type: AverageValue
        averageValue: "100"
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
      - type: Percent
        value: 50
        periodSeconds: 60
      - type: Pods
        value: 2
        periodSeconds: 60
      selectPolicy: Max
```

## CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]
  release:
    types: [ published ]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [api-gateway, subscription-service, telegram-service, alert-engine]
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'
        cache-dependency-path: ${{ matrix.service }}/package-lock.json
    
    - name: Install dependencies
      run: |
        cd ${{ matrix.service }}
        npm ci
    
    - name: Run linting
      run: |
        cd ${{ matrix.service }}
        npm run lint
    
    - name: Run unit tests
      run: |
        cd ${{ matrix.service }}
        npm run test:unit -- --coverage
    
    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./${{ matrix.service }}/coverage/lcov.info
        flags: ${{ matrix.service }}
        name: ${{ matrix.service }}-coverage

  security-scan:
    runs-on: ubuntu-latest
    needs: test
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Run Trivy vulnerability scanner
      uses: aquasecurity/trivy-action@master
      with:
        scan-type: 'fs'
        scan-ref: '.'
        format: 'sarif'
        output: 'trivy-results.sarif'
    
    - name: Upload Trivy scan results
      uses: github/codeql-action/upload-sarif@v2
      with:
        sarif_file: 'trivy-results.sarif'
    
    - name: Run Snyk security scan
      uses: snyk/actions/node@master
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      with:
        args: --severity-threshold=high

  build:
    runs-on: ubuntu-latest
    needs: [test, security-scan]
    if: github.event_name != 'pull_request'
    strategy:
      matrix:
        service: [api-gateway, subscription-service, telegram-service, alert-engine]
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
    
    - name: Log in to Container Registry
      uses: docker/login-action@v3
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Extract metadata
      id: meta
      uses: docker/metadata-action@v5
      with:
        images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}/${{ matrix.service }}
        tags: |
          type=ref,event=branch
          type=ref,event=pr
          type=sha,prefix={{branch}}-
          type=raw,value=latest,enable={{is_default_branch}}
    
    - name: Build and push Docker image
      uses: docker/build-push-action@v5
      with:
        context: ./${{ matrix.service }}
        push: true
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
        platforms: linux/amd64,linux/arm64

  integration-test:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/main'
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Start test environment
      run: |
        docker-compose -f docker-compose.test.yml up -d
        sleep 60  # Wait for services to be ready
    
    - name: Run integration tests
      run: |
        npm run test:integration
    
    - name: Run E2E tests
      run: |
        npm run test:e2e
    
    - name: Stop test environment
      run: |
        docker-compose -f docker-compose.test.yml down

  deploy-staging:
    runs-on: ubuntu-latest
    needs: integration-test
    if: github.ref == 'refs/heads/develop'
    environment: staging
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1
    
    - name: Update kubeconfig
      run: |
        aws eks update-kubeconfig --region us-east-1 --name alertbot-staging
    
    - name: Deploy to staging
      run: |
        kubectl apply -f k8s/staging/
        kubectl rollout status deployment/api-gateway -n alertbot-staging
        kubectl rollout status deployment/subscription-service -n alertbot-staging
        kubectl rollout status deployment/telegram-service -n alertbot-staging
        kubectl rollout status deployment/alert-engine -n alertbot-staging
    
    - name: Run smoke tests
      run: |
        npm run test:smoke -- --env=staging

  deploy-production:
    runs-on: ubuntu-latest
    needs: integration-test
    if: github.ref == 'refs/heads/main'
    environment: production
    
    steps:
    - name: Checkout code
      uses: actions/checkout@v4
    
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v4
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-1
    
    - name: Update kubeconfig
      run: |
        aws eks update-kubeconfig --region us-east-1 --name alertbot-prod
    
    - name: Deploy to production
      run: |
        kubectl apply -f k8s/production/
        kubectl rollout status deployment/api-gateway -n alertbot-prod --timeout=600s
        kubectl rollout status deployment/subscription-service -n alertbot-prod --timeout=600s
        kubectl rollout status deployment/telegram-service -n alertbot-prod --timeout=600s
        kubectl rollout status deployment/alert-engine -n alertbot-prod --timeout=600s
    
    - name: Run production smoke tests
      run: |
        npm run test:smoke -- --env=production
    
    - name: Notify deployment success
      uses: 8398a7/action-slack@v3
      with:
        status: success
        text: 'Production deployment successful! 🚀'
      env:
        SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### GitOps with ArgoCD

```yaml
# ArgoCD Application Configuration
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: alertbot-production
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/alertbot/k8s-manifests
    targetRevision: main
    path: production
  destination:
    server: https://kubernetes.default.svc
    namespace: alertbot-prod
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
    - CreateNamespace=true
    - PrunePropagationPolicy=foreground
    - PruneLast=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
  revisionHistoryLimit: 10
```

## Monitoring & Observability

### Prometheus Configuration

```yaml
# Prometheus Configuration
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alerting_rules.yml"
  - "recording_rules.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  - job_name: 'kubernetes-apiservers'
    kubernetes_sd_configs:
    - role: endpoints
    scheme: https
    tls_config:
      ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
    relabel_configs:
    - source_labels: [__meta_kubernetes_namespace, __meta_kubernetes_service_name, __meta_kubernetes_endpoint_port_name]
      action: keep
      regex: default;kubernetes;https

  - job_name: 'kubernetes-nodes'
    kubernetes_sd_configs:
    - role: node
    scheme: https
    tls_config:
      ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
    relabel_configs:
    - action: labelmap
      regex: __meta_kubernetes_node_label_(.+)
    - target_label: __address__
      replacement: kubernetes.default.svc:443
    - source_labels: [__meta_kubernetes_node_name]
      regex: (.+)
      target_label: __metrics_path__
      replacement: /api/v1/nodes/${1}/proxy/metrics

  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
    - role: pod
    relabel_configs:
    - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
      action: keep
      regex: true
    - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
      action: replace
      target_label: __metrics_path__
      regex: (.+)
    - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
      action: replace
      regex: ([^:]+)(?::\d+)?;(\d+)
      replacement: $1:$2
      target_label: __address__
    - action: labelmap
      regex: __meta_kubernetes_pod_label_(.+)
    - source_labels: [__meta_kubernetes_namespace]
      action: replace
      target_label: kubernetes_namespace
    - source_labels: [__meta_kubernetes_pod_name]
      action: replace
      target_label: kubernetes_pod_name

  - job_name: 'alertbot-services'
    static_configs:
    - targets:
      - api-gateway:3000
      - subscription-service:3000
      - telegram-service:3000
      - alert-engine:3000
    metrics_path: /metrics
    scrape_interval: 10s
```

### Grafana Dashboards

```json
{
  "dashboard": {
    "id": null,
    "title": "Alert Bot - Service Overview",
    "tags": ["alertbot", "microservices"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total[5m])) by (service)",
            "legendFormat": "{{service}}"
          }
        ],
        "yAxes": [
          {
            "label": "Requests/sec",
            "min": 0
          }
        ]
      },
      {
        "id": 2,
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))",
            "legendFormat": "95th percentile - {{service}}"
          },
          {
            "expr": "histogram_quantile(0.50, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service))",
            "legendFormat": "50th percentile - {{service}}"
          }
        ],
        "yAxes": [
          {
            "label": "Seconds",
            "min": 0
          }
        ]
      },
      {
        "id": 3,
        "title": "Error Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(http_requests_total{status=~\"5..\"}[5m])) by (service) / sum(rate(http_requests_total[5m])) by (service)",
            "legendFormat": "{{service}}"
          }
        ],
        "yAxes": [
          {
            "label": "Error Rate",
            "min": 0,
            "max": 1
          }
        ]
      },
      {
        "id": 4,
        "title": "Alert Processing",
        "type": "graph",
        "targets": [
          {
            "expr": "sum(rate(alerts_processed_total[5m]))",
            "legendFormat": "Alerts Processed/sec"
          },
          {
            "expr": "sum(rate(alerts_failed_total[5m]))",
            "legendFormat": "Alerts Failed/sec"
          }
        ]
      }
    ],
    "time": {
      "from": "now-1h",
      "to": "now"
    },
    "refresh": "5s"
  }
}
```

### Alerting Rules

```yaml
# alerting_rules.yml
groups:
- name: alertbot.rules
  rules:
  - alert: HighErrorRate
    expr: |
      (
        sum(rate(http_requests_total{status=~"5.."}[5m])) by (service)
        /
        sum(rate(http_requests_total[5m])) by (service)
      ) > 0.05
    for: 5m
    labels:
      severity: critical
    annotations:
      summary: "High error rate detected for {{ $labels.service }}"
      description: "Error rate is {{ $value | humanizePercentage }} for service {{ $labels.service }}"

  - alert: HighResponseTime
    expr: |
      histogram_quantile(0.95,
        sum(rate(http_request_duration_seconds_bucket[5m])) by (le, service)
      ) > 1
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High response time for {{ $labels.service }}"
      description: "95th percentile response time is {{ $value }}s for {{ $labels.service }}"

  - alert: ServiceDown
    expr: up == 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Service {{ $labels.instance }} is down"
      description: "Service {{ $labels.instance }} has been down for more than 1 minute"

  - alert: HighMemoryUsage
    expr: |
      (
        container_memory_working_set_bytes{pod=~"alertbot-.*"}
        /
        container_spec_memory_limit_bytes{pod=~"alertbot-.*"}
      ) > 0.8
    for: 5m
    labels:
      severity: warning
    annotations:
      summary: "High memory usage for {{ $labels.pod }}"
      description: "Memory usage is {{ $value | humanizePercentage }} for pod {{ $labels.pod }}"

  - alert: AlertProcessingBacklog
    expr: |
      alert_queue_size > 1000
    for: 2m
    labels:
      severity: warning
    annotations:
      summary: "Alert processing backlog detected"
      description: "Alert queue size is {{ $value }}, indicating processing delays"

  - alert: DatabaseConnectionFailure
    expr: |
      mongodb_connections_failed_total > 0
    for: 1m
    labels:
      severity: critical
    annotations:
      summary: "Database connection failures detected"
      description: "{{ $value }} database connection failures in the last minute"
```

## Security & Compliance

### Security Policies

```yaml
# Pod Security Policy
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: alertbot-psp
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
    - ALL
  volumes:
    - 'configMap'
    - 'emptyDir'
    - 'projected'
    - 'secret'
    - 'downwardAPI'
    - 'persistentVolumeClaim'
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'RunAsAny'
  fsGroup:
    rule: 'RunAsAny'
  readOnlyRootFilesystem: true
```

### Network Policies

```yaml
# Network Policy for API Gateway
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-gateway-netpol
  namespace: alertbot-prod
spec:
  podSelector:
    matchLabels:
      app: api-gateway
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress-nginx
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: subscription-service
    ports:
    - protocol: TCP
      port: 3000
  - to:
    - podSelector:
        matchLabels:
          app: telegram-service
    ports:
    - protocol: TCP
      port: 3000
  - to:
    - podSelector:
        matchLabels:
          app: alert-engine
    ports:
    - protocol: TCP
      port: 3000
  - to: []
    ports:
    - protocol: TCP
      port: 27017  # MongoDB
    - protocol: TCP
      port: 6379   # Redis
    - protocol: TCP
      port: 53     # DNS
    - protocol: UDP
      port: 53     # DNS
```

### Secrets Management

```yaml
# External Secrets Operator Configuration
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
  namespace: alertbot-prod
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        secretRef:
          accessKeyID:
            name: aws-credentials
            key: access-key-id
          secretAccessKey:
            name: aws-credentials
            key: secret-access-key

---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: database-secrets
  namespace: alertbot-prod
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: database-secrets
    creationPolicy: Owner
  data:
  - secretKey: mongodb-uri
    remoteRef:
      key: alertbot/database
      property: mongodb_uri
  - secretKey: redis-uri
    remoteRef:
      key: alertbot/database
      property: redis_uri
```

## Backup & Disaster Recovery

### Backup Strategy

```yaml
# Velero Backup Configuration
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: alertbot-daily-backup
  namespace: velero
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  template:
    includedNamespaces:
    - alertbot-prod
    - alertbot-staging
    excludedResources:
    - events
    - events.events.k8s.io
    storageLocation: aws-s3
    ttl: 720h  # 30 days
    snapshotVolumes: true

---
apiVersion: velero.io/v1
kind: Schedule
metadata:
  name: alertbot-weekly-backup
  namespace: velero
spec:
  schedule: "0 1 * * 0"  # Weekly on Sunday at 1 AM
  template:
    includedNamespaces:
    - alertbot-prod
    storageLocation: aws-s3
    ttl: 2160h  # 90 days
    snapshotVolumes: true
```

### Database Backup

```bash
#!/bin/bash
# MongoDB Backup Script

set -e

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/mongodb"
S3_BUCKET="alertbot-backups"
MONGODB_URI="$MONGODB_URI"
RETENTION_DAYS=30

# Create backup directory
mkdir -p $BACKUP_DIR

# Perform MongoDB dump
echo "Starting MongoDB backup..."
mongodump --uri="$MONGODB_URI" --out="$BACKUP_DIR/mongodb_$BACKUP_DATE"

# Compress backup
echo "Compressing backup..."
tar -czf "$BACKUP_DIR/mongodb_$BACKUP_DATE.tar.gz" -C "$BACKUP_DIR" "mongodb_$BACKUP_DATE"
rm -rf "$BACKUP_DIR/mongodb_$BACKUP_DATE"

# Upload to S3
echo "Uploading to S3..."
aws s3 cp "$BACKUP_DIR/mongodb_$BACKUP_DATE.tar.gz" "s3://$S3_BUCKET/mongodb/"

# Clean up local backup
rm -f "$BACKUP_DIR/mongodb_$BACKUP_DATE.tar.gz"

# Clean up old S3 backups
echo "Cleaning up old backups..."
aws s3 ls "s3://$S3_BUCKET/mongodb/" | while read -r line; do
  createDate=$(echo $line | awk '{print $1" "$2}')
  createDate=$(date -d "$createDate" +%s)
  olderThan=$(date -d "$RETENTION_DAYS days ago" +%s)
  if [[ $createDate -lt $olderThan ]]; then
    fileName=$(echo $line | awk '{print $4}')
    if [[ $fileName != "" ]]; then
      aws s3 rm "s3://$S3_BUCKET/mongodb/$fileName"
    fi
  fi
done

echo "MongoDB backup completed successfully"
```

### Disaster Recovery Plan

```yaml
# Disaster Recovery Procedures
disaster_recovery:
  rto: 4 hours  # Recovery Time Objective
  rpo: 1 hour   # Recovery Point Objective
  
  procedures:
    total_outage:
      steps:
        1. "Assess the scope of the outage"
        2. "Activate disaster recovery team"
        3. "Switch DNS to backup region"
        4. "Restore services in backup region"
        5. "Restore data from latest backup"
        6. "Validate system functionality"
        7. "Communicate status to stakeholders"
      
    partial_outage:
      steps:
        1. "Identify affected services"
        2. "Scale up healthy services"
        3. "Restart failed services"
        4. "Monitor system recovery"
        5. "Investigate root cause"
    
    data_corruption:
      steps:
        1. "Stop all write operations"
        2. "Assess data integrity"
        3. "Restore from point-in-time backup"
        4. "Validate data consistency"
        5. "Resume operations"
        6. "Implement preventive measures"
  
  contacts:
    primary: "devops-team@alertbot.com"
    secondary: "cto@alertbot.com"
    escalation: "ceo@alertbot.com"
  
  communication:
    internal: "Slack #incident-response"
    external: "Status page + Email notifications"
```

## Performance Optimization

### Resource Optimization

```yaml
# Vertical Pod Autoscaler
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: api-gateway-vpa
  namespace: alertbot-prod
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  updatePolicy:
    updateMode: "Auto"
  resourcePolicy:
    containerPolicies:
    - containerName: api-gateway
      minAllowed:
        cpu: 100m
        memory: 128Mi
      maxAllowed:
        cpu: 2
        memory: 2Gi
      controlledResources: ["cpu", "memory"]
```

### Caching Strategy

```yaml
# Redis Cluster Configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: redis-config
  namespace: alertbot-prod
data:
  redis.conf: |
    # Redis Configuration
    maxmemory 2gb
    maxmemory-policy allkeys-lru
    save 900 1
    save 300 10
    save 60 10000
    
    # Cluster configuration
    cluster-enabled yes
    cluster-config-file nodes.conf
    cluster-node-timeout 5000
    
    # Security
    requirepass ${REDIS_PASSWORD}
    
    # Performance
    tcp-keepalive 60
    timeout 300
```

## Cost Optimization

### Resource Management

```yaml
# Resource Quotas
apiVersion: v1
kind: ResourceQuota
metadata:
  name: alertbot-quota
  namespace: alertbot-prod
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
    persistentvolumeclaims: "10"
    services: "20"
    secrets: "50"
    configmaps: "50"

---
apiVersion: v1
kind: LimitRange
metadata:
  name: alertbot-limits
  namespace: alertbot-prod
spec:
  limits:
  - default:
      cpu: 500m
      memory: 512Mi
    defaultRequest:
      cpu: 100m
      memory: 128Mi
    type: Container
```

### Cost Monitoring

```yaml
# Cost Allocation Tags
cost_allocation:
  tags:
    Project: "AlertBot"
    Environment: "Production"
    Team: "DevOps"
    CostCenter: "Engineering"
  
  monitoring:
    tools:
      - AWS Cost Explorer
      - Kubecost
      - Prometheus cost metrics
    
    alerts:
      - Monthly budget exceeded
      - Unusual spending patterns
      - Resource waste detection
  
  optimization:
    strategies:
      - Spot instances for non-critical workloads
      - Reserved instances for predictable workloads
      - Auto-scaling based on demand
      - Resource right-sizing
```

This comprehensive DevOps strategy provides a robust foundation for deploying, monitoring, and maintaining the Alert Bot microservices architecture with industry best practices for security, scalability, and reliability.